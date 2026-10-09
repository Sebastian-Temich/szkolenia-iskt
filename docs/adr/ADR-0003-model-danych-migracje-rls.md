# ADR-0003 — Model danych, migracje i polityki RLS

- **Status:** proponowany (wymaga zatwierdzenia ISKT w bramce planu)
- **Data:** 2026-10-09
- **Autor:** Koordynator Techniczny / Intake Lead
- **Pełne DDL i macierz dostępu:** [`docs/architektura/model-danych.md`](../architektura/model-danych.md)
- **Powiązane:** [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md), [ADR-0004](ADR-0004-formularze-antyspam-resend.md)

## Kontekst

Model danych musi obsłużyć: katalog szkoleń z kategoriami i wyszukiwaniem, trenerów powiązanych ze szkoleniami, rozdział treści opublikowanych od szkiców, zgłoszenia z formularzy z danymi osobowymi i statusami obsługi, oraz jedno konto administratora. Dane osobowe mają retencję 12 miesięcy (robocza decyzja z `04_Ryzyka/RODO i dane osobowe.md`).

Poza zakresem MVP (zlecenie §4): aktualne nabory/terminy jako osobny moduł, płatności, konta uczestników, upload plików.

## Decyzje

### D1. Tabele

Dziewięć tabel w schemacie `public`:

| Tabela | Rola |
| --- | --- |
| `admin_users` | mapowanie `auth.users` → uprawnienie administratora; podstawa predykatu RLS |
| `categories` | kategorie szkoleń (AI, ESG, język angielski, rozwój oprogramowania, projekty B+R) |
| `trainers` | trenerzy; zdjęcie opcjonalne do czasu dostarczenia praw do wizerunku |
| `trainings` | szkolenia wraz z programem, efektami uczenia się i danymi SEO |
| `training_trainers` | relacja wiele-do-wielu szkolenie ↔ trener |
| `inquiries` | zgłoszenia z formularzy (dane osobowe) |
| `inquiry_status_history` | historia zmian statusu zgłoszenia |
| `admin_audit_log` | dziennik istotnych operacji administracyjnych |
| `form_submission_throttle` | techniczne liczniki antyspamowe, retencja 24 h |

### D2. Publikacja jako pole, nie jako osobna tabela wersji

`is_published boolean` + `published_at timestamptz` na `categories`, `trainers`, `trainings`. MVP nie potrzebuje wersjonowania treści ani workflow redakcyjnego (jedna rola administratora, `01_Wymagania/Role i uprawnienia.md`). Wycofanie publikacji to `is_published = false` — rekord zostaje, więc operacja jest odwracalna bez utraty danych.

### D3. Terminy szkoleń bez modułu naborów

`trainings.terms_note text` — tekst swobodny („Najbliższe terminy” z szablonu). Pełna tabela terminów i naborów jest świadomie poza MVP; wprowadzenie jej później nie wymaga migracji destrukcyjnej, tylko nowej tabeli i wygaszenia pola.

### D4. Wyszukiwanie: tsvector z `unaccent` + fallback trigramowy

PostgreSQL nie ma wbudowanej konfiguracji `polish`. Decyzja:

- kolumna generowana `search_tsv` na `trainings`, zbudowana na konfiguracji `simple` nad tekstem przepuszczonym przez `unaccent`, z wagami: tytuł `A`, streszczenie `B`, opis i grupa docelowa `C`;
- ponieważ `unaccent()` jest `STABLE`, a kolumna generowana wymaga `IMMUTABLE`, wprowadzamy cienki wrapper `public.immutable_unaccent(text)` oznaczony `IMMUTABLE` z jawnie ustawionym słownikiem — standardowy, udokumentowany wzorzec; jego konsekwencją jest konieczność przebudowania indeksu przy zmianie słownika `unaccent`;
- indeks `GIN` na `search_tsv` do zapytań pełnotekstowych;
- rozszerzenie `pg_trgm` + indeks trigramowy na `title` dla dopasowań częściowych i literówek (`ILIKE '%…%'`), używane jako fallback, gdy zapytanie tsvector nie zwróci wyników.

Brak stemmingu polskiego jest akceptowalnym kompromisem MVP: katalog ma kilkadziesiąt pozycji, a `unaccent` + trigram pokrywają realne zapytania. Alternatywa (słownik `ispell` dla polskiego) wymaga plików słownikowych na serwerze bazy — niedostępne na Supabase Free.

### D5. Zgłoszenia są zapisywane wyłącznie przez warstwę serwerową

Tabela `inquiries` **nie ma żadnej polityki RLS dla `anon` i `authenticated`** — ani `SELECT`, ani `INSERT`. Zapis wykonuje Route Handler kluczem `service_role` (omija RLS), po walidacji i kontroli antyspamowej. Uzasadnienie: polityka `INSERT` dla `anon` byłaby otwartym endpointem zapisu do bazy bez możliwości rate-limitingu i bez honeypota, a `WITH CHECK` nie potrafi egzekwować reguł antyspamowych. Konsekwencja: żaden klucz publiczny nie daje dostępu do danych osobowych nawet przy błędzie w polityce.

### D6. Administrator rozpoznawany przez tabelę, nie przez claim w JWT

Predykat `public.is_admin()` — funkcja `SECURITY DEFINER`, `STABLE`, z `SET search_path = public, pg_temp` — sprawdza istnienie wiersza w `admin_users` dla `auth.uid()`. Powody: claimy w `app_metadata` wymagają ręcznej edycji użytkownika lub hooka, są trudne do przetestowania i do odwołania; tabela jest migrowalna, audytowalna i testowalna. `admin_users` nie ma polityk zapisu z klienta — wiersz dodaje ISKT (migracja lub Studio) przy ustanawianiu konta.

### D7. Administrator nie zmienia dowolnych kolumn zgłoszenia

Polityka `UPDATE` na `inquiries` dla administratora jest zawężona triggerem `enforce_inquiry_admin_update()`, który odrzuca zmianę pól z danymi osobowymi i pól technicznych; dozwolone są `status`, `admin_note`, `first_handled_at`, `closed_at`. Powód: zgłoszenie jest dowodem komunikacji z osobą — treść nie powinna być edytowalna, a RLS nie wyraża ograniczeń kolumnowych.

Przejścia statusu: `nowe → w_toku`, `nowe → zamkniete`, `w_toku → zamkniete`, `zamkniete → w_toku` (ponowne otwarcie). Walidowane w triggerze i pokryte testami.

### D8. Retencja 12 miesięcy jako pole + zadanie, nie jako automat

`inquiries.retention_delete_after date` ustawiane domyślnie na `now() + 12 months`. Usuwanie realizuje funkcja `public.purge_expired_inquiries()` wywoływana ręcznie lub harmonogramem — **harmonogram (`pg_cron`) nie jest włączany w MVP**. Powód: automatyczne, nieodwracalne usuwanie danych przed zatwierdzeniem klauzuli i retencji przez administratora danych byłoby przedwczesne. Funkcja i runbook są gotowe; uruchomienie harmonogramu to decyzja ISKT.

### D9. Migracje jako jedyne źródło prawdy schematu

Katalog `supabase/migrations/`, numeracja znacznikiem czasu CLI, jeden logiczny krok na plik, każdy plik z komentarzem nagłówkowym (cel, powiązane ADR, odwracalność). Zakaz ręcznych zmian schematu w Studio. Dowód odtwarzalności: `supabase db reset` w CI buduje bazę od zera na każdym PR.

Planowany podział pierwszych migracji:

1. `..._extensions_and_helpers` — `pgcrypto`, `citext`, `unaccent`, `pg_trgm`, `immutable_unaccent`, `set_updated_at`
2. `..._admin_users_and_is_admin`
3. `..._catalog_tables` — `categories`, `trainers`, `trainings`, `training_trainers`
4. `..._catalog_search` — `search_tsv`, indeksy GIN/trigram
5. `..._inquiries` — `inquiries`, `inquiry_status_history`, triggery, retencja
6. `..._audit_and_throttle` — `admin_audit_log`, `form_submission_throttle`
7. `..._rls_policies` — `ENABLE ROW LEVEL SECURITY` i wszystkie polityki, jednym plikiem dla czytelności przeglądu bezpieczeństwa

### D10. Domyślna odmowa dostępu

W migracji RLS: `ENABLE ROW LEVEL SECURITY` na **każdej** tabeli `public` (również tych bez polityk), jawne `REVOKE ALL ... FROM anon, authenticated`, a następnie minimalne `GRANT SELECT` tylko tam, gdzie publiczny odczyt jest zamierzony. Test w CI sprawdza, że nie istnieje tabela w `public` z wyłączonym RLS.

## Konsekwencje

- Publiczny frontend korzysta wyłącznie z klucza publicznego i widzi dokładnie to, co jest opublikowane — bez filtrowania w kodzie aplikacji, które dałoby się pominąć.
- Panel administratora musi używać sesji użytkownika (nie `service_role`) do CRUD treści, żeby RLS realnie uczestniczył w autoryzacji; `service_role` zostaje zarezerwowany dla zapisu zgłoszeń i zadań utrzymaniowych.
- Trigger ograniczający kolumny to dodatkowa złożoność — wymaga testów pozytywnych i negatywnych (ujęte w DoD Etapu 2).
- Brak stemmingu polskiego może dawać gorsze wyniki dla odmienionych form; do ponownej oceny po dostarczeniu finalnych treści.

## Wymagane decyzje ISKT

1. Zatwierdzenie modelu danych i macierzy dostępu z `docs/architektura/model-danych.md`.
2. Potwierdzenie retencji 12 miesięcy oraz zgody na ręczne (nie automatyczne) usuwanie w MVP (D8).
3. Potwierdzenie, że terminy szkoleń w MVP są polem tekstowym, bez modułu naborów (D3).
4. Ustanowienie konta administratora i dodanie wiersza w `admin_users` — czynność ISKT, nie agenta (D6).
