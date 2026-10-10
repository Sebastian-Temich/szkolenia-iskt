# ADR-0003 — Model danych, migracje i polityki RLS

- **Status:** **zatwierdzony przez ISKT 2026-10-09** (bramka planu zamknięta); **zaakceptowany ze zmianami** w bramce architektury (E2R) 2026-10-09. Zweryfikowany wobec migracji 2026-10-10 w etapie E9T — patrz „Stan implementacji (E9T)” na końcu dokumentu.
- **Data:** 2026-10-09 (decyzja), 2026-10-10 (weryfikacja wobec implementacji)
- **Autor:** Koordynator Techniczny / Intake Lead
- **Opis procedury migracji:** [`docs/architektura/migracje.md`](../architektura/migracje.md)
- **Pełne DDL i macierz dostępu:** [`docs/architektura/model-danych.md`](../architektura/model-danych.md)
- **Powiązane:** [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md), [ADR-0004](ADR-0004-formularze-antyspam-resend.md)

## Kontekst

Model danych musi obsłużyć: katalog szkoleń z kategoriami i wyszukiwaniem, trenerów powiązanych ze szkoleniami, rozdział treści opublikowanych od szkiców, zgłoszenia z formularzy z danymi osobowymi i statusami obsługi, oraz jedno konto administratora. Dane osobowe mają retencję 12 miesięcy (robocza decyzja z `04_Ryzyka/RODO i dane osobowe.md`).

Poza zakresem MVP (zlecenie §4): aktualne nabory/terminy jako osobny moduł, płatności, konta uczestników, upload plików.

## Decyzje

### D1. Tabele

Dziewięć tabel w schemacie `public`:

| Tabela                     | Rola                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| `admin_users`              | mapowanie `auth.users` → uprawnienie administratora; podstawa predykatu RLS       |
| `categories`               | kategorie szkoleń (AI, ESG, język angielski, rozwój oprogramowania, projekty B+R) |
| `trainers`                 | trenerzy; zdjęcie opcjonalne do czasu dostarczenia praw do wizerunku              |
| `trainings`                | szkolenia wraz z programem, efektami uczenia się i danymi SEO                     |
| `training_trainers`        | relacja wiele-do-wielu szkolenie ↔ trener                                         |
| `inquiries`                | zgłoszenia z formularzy (dane osobowe)                                            |
| `inquiry_status_history`   | historia zmian statusu zgłoszenia                                                 |
| `admin_audit_log`          | dziennik istotnych operacji administracyjnych                                     |
| `form_submission_throttle` | techniczne liczniki antyspamowe, retencja 24 h                                    |

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

> **Rozstrzygnięcie:** punkty 1 i 3 zatwierdzone przez ISKT 2026-10-09. Punkt 2 pozostaje **otwarty** — bramka RODO (E8, pozycja I6) wymaga nie tylko potwierdzenia okresu, lecz także **wyboru trybu wykonywania** (harmonogram albo procedura z imiennym właścicielem i rejestrem wykonań). Punkt 4 pozostaje **otwarty**. Oba w [skonsolidowanej liście ISKT](../odbior/braki-i-decyzje-iskt.md).

---

## Stan implementacji (E9T, 2026-10-10)

Sekcja dopisana w etapie E9T. Treść decyzji D1–D10 powyżej pozostaje bez zmian — zmiany względem niej są poniżej wypisane jawnie. Pełny, zweryfikowany opis schematu: [`docs/architektura/model-danych.md`](../architektura/model-danych.md); procedura migracji: [`docs/architektura/migracje.md`](../architektura/migracje.md).

### Decyzje zrealizowane bez zmian

**D1** (9 tabel), **D2** (publikacja jako pole), **D3** (`terms_note` jako tekst), **D5** (zgłoszenia zapisywane wyłącznie warstwą serwerową), **D6** (administrator rozpoznawany tabelą, nie claimem w JWT) — zaimplementowane dokładnie jak opisane. Bramka architektury (E2R) zmierzyła macierz dostępu §4 na działającej bazie dla wszystkich 9 tabel i potwierdziła pełną zgodność ze specyfikacją; bramka E7 powtórzyła to sondami HTTP kluczem publicznym na pięciu tabelach ograniczonych — `401` / `42501` w obu kierunkach.

Przy **D2** bramka E2R dopisała konsekwencję, której pierwotny tekst nie nazywał: brak wersjonowania oznacza, że **edycja opublikowanego wiersza wchodzi na żywo natychmiast**, bez podglądu i bez wycofania zmiany. Dla jednej roli administratora jest to akceptowalne, ale musi być jawne w interfejsie panelu.

Przy **D6** E2R potwierdziła, że decyzja się broni także kosztowo: po owinięciu predykatu w `(select public.is_admin())` koszt spada do jednego wywołania na zapytanie (`InitPlan`), a zachowane zostaje natychmiastowe odwołanie uprawnień — czego wariant z claimem w JWT nie daje (token pozostaje administracyjny do wygaśnięcia, przy `jwt_expiry = 3600` nawet godzinę po odebraniu dostępu). Owinięcie predykatu **nie zostało jeszcze wprowadzone** — przy skali katalogu MVP jest pomijalne, ale lista zgłoszeń w panelu rośnie bez ograniczenia (E2R, C4).

### D4 — wyszukiwanie: decyzja utrzymana, kontrakt uzupełniony

Decyzja (tsvector na konfiguracji `simple` nad tekstem po `unaccent`, wagi A/B/C, indeks GIN, fallback trigramowy) jest zaimplementowana w migracjach `…120100` i `…120400`. E2R potwierdziła, że rezygnacja ze stemmingu polskiego jest właściwa (słownika `ispell` nie ma na Supabase Free).

**Zmiana wobec pierwotnego brzmienia — dopisany kontrakt normalizacji zapytania.** E2R zmierzyła, że `plainto_tsquery('simple','zrównoważony')` daje **0 trafień**, a to samo słowo po `immutable_unaccent` — 1 trafienie. Pierwotny ADR nie mówił, **kto** normalizuje frazę wejściową, więc najczęstszy przypadek (użytkownik pisze po polsku z diakrytykami) nie działał, a test integracyjny tego nie wyłapywał, bo podawał zapytanie już w ASCII.

Rozstrzygnięcie: normalizację wykonuje **warstwa aplikacji**, nie baza. Funkcja `unaccentPl()` w `lib/catalog.ts` odwzorowuje `public.immutable_unaccent()` po stronie Node (NFD + usunięcie znaków diakrytycznych + jawne mapowanie `ł`/`Ł`, które nie mają rozkładu NFD), a `lib/public-catalog.ts` woła `.textSearch("search_tsv", unaccentPl(q), { config: "simple", type: "websearch" })`. E2R rekomendowała inny wariant — RPC `search_trainings(q)` w migracji — i ten wariant **nie został wybrany**; skutek funkcjonalny jest ten sam, ale kontrakt jest teraz rozdzielony na dwa pliki w dwóch językach. Konsekwencja do pilnowania: **zmiana słownika `unaccent` wymaga zmiany `unaccentPl()`**, inaczej obie strony rozjadą się po cichu.

Pozostaje nieuzupełnione (E2R, C2): indeks trigramowy pokrywa tylko `title`, a `summary` ma w tsvectorze wagę B bez odpowiednika trigramowego.

### D7 — administrator nie zmienia dowolnych kolumn: **ADR obiecuje więcej, niż baza robi**

Brzmienie D7: trigger „odrzuca zmianę pól z danymi osobowymi **i pól technicznych**; dozwolone są `status`, `admin_note`, `first_handled_at`, `closed_at”`.

Implementacja `enforce_inquiry_admin_update()` to **czarna lista** 11 kolumn osobowych. Wszystko poza nią jest otwarte. Zmierzone w bramce E2R w sesji administratora:

```
update inquiries set retention_delete_after = '2099-01-01'                 -> PRZESZŁO
update inquiries set notification_status / notification_error / source_path -> PRZESZŁO
update inquiries set id = <inny uuid>                                      -> PRZESZŁO
update inquiries set email = ...                                           -> odrzucone (kontrola działa)
```

`retention_delete_after` **jest** mechanizmem retencji z D8, więc administrator może przesunąć go bezterminowo, bez wpisu w `inquiry_status_history` i bez wpisu w `admin_audit_log`. Niezależnie od tego czarna lista **zawodzi otwarciem** dla każdej kolumny dodanej w przyszłej migracji.

**Status: otwarte** (E2R B2, powtórzone jako E7 N4). Rekomendowana poprawka — utrzymać tekst ADR i dowieźć go uprawnieniami kolumnowymi, nie listą w triggerze:

```sql
revoke update on public.inquiries from authenticated;
grant  update (status, admin_note) on public.inquiries to authenticated;
```

Uprawnienia kolumnowe sprawdzają kolumny z `SET`, nie te ustawiane przez trigger, więc `first_handled_at`, `closed_at` i `updated_at` dalej działają, a trigger zostaje jako obrona w głąb. Poprawka nie została wprowadzona.

**Zaakceptowane odstępstwo:** `enforce_inquiry_admin_update()` jest `SECURITY DEFINER` z `set search_path = public, pg_temp`, mimo że dokument modelu danych nie wskazywał trybu bezpieczeństwa. Powód: trigger wstawia wiersz do `inquiry_status_history`, która ma RLS i **nie ma** `INSERT` dla roli `authenticated` (macierz: „wpis przez trigger”). Bez `DEFINER` legalna zmiana statusu przez administratora byłaby odrzucana. E2R zaakceptowała to wprost i potwierdziła na działającej bazie.

Przejścia statusu zaimplementowane dokładnie jak w decyzji (`nowe → w_toku`, `nowe → zamkniete`, `w_toku → zamkniete`, `zamkniete → w_toku`), z testami pozytywnym P4 i negatywnym N7.

### D8 — retencja: funkcja działa, egzekwowania nie ma

Zrealizowane: `inquiries.retention_delete_after` z domyślną wartością `now() + 12 months`, indeks `inquiries_retention_idx`, `purge_expired_inquiries()` zwracająca faktyczną liczbę usuniętych wierszy (`GET DIAGNOSTICS`, nie placeholder z dokumentu wejściowego). `inquiry_status_history` jest objęta kasowaniem przez `on delete cascade` — zweryfikowane w bramce E8 w migracji, nie tylko zadeklarowane.

Trzy rzeczy, których pierwotna decyzja nie obejmowała, a bramka RODO (E8) nazwała:

1. **Retencja nie jest egzekwowana, jest tylko możliwa** (E8 §3a). Dziś nie istnieje nic, co faktycznie usunie dane po 12 miesiącach: ani harmonogram, ani przypisany właściciel, ani termin. Powód rezygnacji z `pg_cron` E8 uznała za racjonalny, ale przed publikacją musi istnieć jedno z dwojga — włączony harmonogram albo procedura z imiennie wskazanym właścicielem, cyklem i rejestrem wykonań (pozycja **I6**).
2. **Dwie kopie danych są poza zasięgiem mechanizmu** (E8 §3c): skrzynka odbiorcy powiadomień i panel/logi Resend. `purge_expired_inquiries()` nie dosięga żadnej z nich, więc zadeklarowana retencja 12 miesięcy nie jest prawdziwa **na poziomie organizacji**. Musi to trafić do procedury retencji i do klauzuli, inaczej informacja podana osobie będzie nieprawdziwa (pozycje **I7**, **I8**).
3. **`form_submission_throttle`: retencja 24 h też jest tylko możliwa** — `purge_submission_throttle()` jest wywoływana wyłącznie ręcznie (pozycja **I10**).

**Dopisane w implementacji (nie było w decyzji):** migracja `…120800` dodaje `purge_expired_audit_log(older_than interval default interval '24 months')`, bo `admin_audit_log` nie miał żadnej retencji, a `entity_id` nie ma klucza obcego do `inquiries`, więc `purge_expired_inquiries()` tych wierszy nie dotyka (E8 §3b, E7 N3). **Docelowy okres retencji dziennika audytu jest decyzją ISKT** (pozycja **I9**); wartość 24 miesiące jest techniczną, konserwatywną wartością domyślną do zmiany jedną migracją.

### D9 — migracje jako jedyne źródło prawdy: zrealizowane, z ósmym plikiem

Plan z decyzji przewidywał 7 migracji. Faktycznie jest **8** — ósma dowozi poprawkę bezpieczeństwa z D10 (poniżej):

| #   | Plik                                          | Zakres                                                                                                                            |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `20261009120100_extensions_and_helpers.sql`   | `pgcrypto`, `citext`, `unaccent`, `pg_trgm`, `immutable_unaccent()`, `set_updated_at()`                                           |
| 2   | `20261009120200_admin_users_and_is_admin.sql` | `admin_users`, `is_admin()`                                                                                                       |
| 3   | `20261009120300_catalog_tables.sql`           | `categories`, `trainers`, `trainings`, `training_trainers`, triggery `updated_at`, indeksy katalogowe                             |
| 4   | `20261009120400_catalog_search.sql`           | `trainings.search_tsv` (kolumna generowana), indeksy GIN i trigramowy                                                             |
| 5   | `20261009120500_inquiries.sql`                | `inquiries`, `inquiry_status_history`, `enforce_inquiry_admin_update()` + trigger, `purge_expired_inquiries()`                    |
| 6   | `20261009120600_audit_and_throttle.sql`       | `admin_audit_log`, `form_submission_throttle`, `purge_submission_throttle()`                                                      |
| 7   | `20261009120700_rls_policies.sql`             | `ENABLE ROW LEVEL SECURITY` na 9 tabelach, `REVOKE` dla ról klienckich, `GRANT`-y, wszystkie polityki                             |
| 8   | `20261009120800_function_execute_grants.sql`  | odebranie `EXECUTE` od `PUBLIC` na funkcjach projektu, `purge_expired_audit_log()`, ograniczenie `admin_audit_log_details_no_pii` |

Każdy plik ma komentarz nagłówkowy z celem, źródłem i notą o odwracalności — zgodnie z decyzją. Zakaz ręcznych zmian w Studio obowiązuje.

### D10 — domyślna odmowa: **zakres rozszerzony na funkcje po defekcie P0**

Pierwotna decyzja opisywała domyślną odmowę w kategoriach **tabel i polityk**. To było niewystarczające i doprowadziło do defektu krytycznego.

**Co się stało.** PostgreSQL nadaje każdej nowej funkcji domyślny `EXECUTE TO PUBLIC`, a `revoke all on all tables / sequences` funkcji nie obejmuje. Migracja `…120700` tylko _dodawała_ granty i nigdy nie odbierała domyślnego. Funkcje `purge_*` są `SECURITY DEFINER`, własność `postgres`, nietriggerowe i leżą w schemacie `public`, który PostgREST publikuje — więc były wywoływalne **samym kluczem publicznym** jako `POST /rest/v1/rpc/purge_*`. Zmierzone niezależnie w trzech bramkach (E2R B1, E8 §6a, E7 K1):

```
POST /rest/v1/rpc/purge_expired_inquiries   -> HTTP 200   (usuwa zgłoszenia po terminie retencji)
POST /rest/v1/rpc/purge_submission_throttle -> HTTP 204   (kasuje liczniki antyspamowe)
```

Skutek: dowolna osoba z internetu mogła wymusić zadanie retencyjne w wybranym momencie, bez uwierzytelnienia i bez śladu w `admin_audit_log` — naruszenie art. 32 ust. 1 lit. b i art. 5 ust. 2 RODO. Żaden test tego nie wykrył, bo kontrola negatywna N10 badała wyłącznie `relrowsecurity`; dla tej klasy błędu jest niewidoczna.

**Naprawa (ISK-356), w migracji `…120800`:** celowany `revoke execute … from public, anon, authenticated` na wszystkich sześciu funkcjach projektu, potem minimalny re-grant (`is_admin()` i `immutable_unaccent()` dla `authenticated`, funkcje `purge_*` wyłącznie dla `service_role`). **Celowo nie użyto** zbiorczego `revoke execute on all functions in schema public` — `citext`, `pg_trgm` i `unaccent` są zainstalowane w `public`, więc zbiorcze odebranie psuje anonowi porównania `slug` i wyszukiwanie trigramowe. Dołożono test integracyjny `tests/integration/function-grants.test.ts`, który sprawdza `has_function_privilege` dla każdej funkcji projektu, żeby ta klasa błędu nie wróciła przy kolejnej funkcji.

**Zmiana zakresu decyzji D10 — wiążąca na przyszłość:** „domyślna odmowa” obejmuje **tabele, polityki i funkcje** oraz wszystko, co schemat wystawiony przez PostgREST publikuje jako endpoint. Kontrola negatywna musi badać uprawnienia funkcji, nie tylko flagę RLS na tabelach.

**Ustalenie nadal otwarte (E2R C3):** domyślna odmowa jest dziś **zdarzeniem jednorazowym**, nie niezmiennikiem. Nowa tabela utworzona przez rolę `postgres` dostaje `relrowsecurity = false` oraz — zmierzone w `pg_default_acl` — `MAINTAIN, REFERENCES, TRIGGER, TRUNCATE` dla `anon`/`authenticated`. **RLS nie obejmuje `TRUNCATE`**; E2R zademonstrowała `anon` czyszczącego tabelę z włączonym RLS i bez polityk. Uczciwa kwalifikacja: przez PostgREST dziś nieosiągalne (REST nie wystawia `TRUNCATE`), więc to naruszenie zasady najmniejszych uprawnień, nie żywa dziura zdalna. Poprawka to jedna linia `alter default privileges … revoke all on tables from anon, authenticated` i **nie została wprowadzona**.

### Kto pisze do `admin_audit_log` — rozstrzygnięte przez E2R, niezrealizowane

Pierwotny ADR nie określał tego, a konsekwencje mówiły, że panel używa sesji użytkownika, podczas gdy `service_role` jest zarezerwowany dla zgłoszeń i zadań utrzymaniowych. Tabela `admin_audit_log` nie ma `INSERT` dla roli `authenticated`, więc panel albo łamie tę granicę przy każdej akcji, albo po cichu nie audytuje.

**E2R rozstrzygnęła: audyt należy do bazy, nie do aplikacji** — triggery `AFTER INSERT/UPDATE/DELETE` (`SECURITY DEFINER`) na `categories`/`trainers`/`trainings` zapisujące `action`/`entity`/`entity_id` + `auth.uid()`. Wtedy dziennika nie da się pominąć, a panel zostaje przy sesji użytkownika.

**Stan faktyczny:** triggery audytu **nie istnieją**. Jedyny wpis do `admin_audit_log` powstaje w `lib/inquiries/repository.ts` (`recordSuspectedSpam`, akcja `inquiry.suspected_spam`) — kluczem `service_role` z Route Handlera, czyli poza panelem. Operacje administracyjne (publikacja, wycofanie, usunięcie, zmiana statusu) **nie są audytowane**. Pozycja otwarta.

Pozostałe ustalenia o tej tabeli: `inquiry_status_history.note` nie jest nigdy zapisywany (E2R C6), a `published_at` jest zarządzane przez aplikację z asymetrycznym ograniczeniem — `trainings` ma `trainings_published_has_date`, `categories` i `trainers` nie (E2R C7, zarówno w migracji, jak i w dokumencie modelu danych).

### Dopisane w implementacji ponad decyzję

| Obiekt                                        | Skąd               | Dlaczego                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `purge_expired_audit_log(interval)`           | migracja `…120800` | `admin_audit_log` nie miał retencji (E8 §3b, E7 N3)                                                                                                                                                                                      |
| ograniczenie `admin_audit_log_details_no_pii` | migracja `…120800` | zakaz danych osobowych w `details` był **tylko komentarzem SQL**; przeniesiony do egzekwowalnego `CHECK` odrzucającego wpisy z kluczami `email`, `phone`, `full_name`, `company_name`, `message`, `interest_area` na najwyższym poziomie |
| `inquiries.source_path`                       | migracja `…120500` | pole **zarezerwowane**, warstwa API go dziś nie zapisuje, więc jest zawsze `NULL`; świadomie zachowane dla przyszłej atrybucji źródła (E8 T11)                                                                                           |
