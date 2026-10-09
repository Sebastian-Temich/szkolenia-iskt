# ADR-0002 — Środowisko lokalne i bezpieczna praca z produkcyjnym projektem Supabase

- **Status:** proponowany (wymaga zatwierdzenia ISKT w bramce planu)
- **Data:** 2026-10-09
- **Autor:** Koordynator Techniczny / Intake Lead
- **Odpowiada na:** zlecenie §15.1 — „bezpieczna strategia lokalnego developmentu bez niekontrolowanego zapisu do produkcyjnego Supabase”
- **Powiązane:** [ADR-0003](ADR-0003-model-danych-migracje-rls.md), [ADR-0005](ADR-0005-ci-i-strategia-testow.md)

## Kontekst

Project Access Card (Obsidian, poza repozytorium) wskazuje istniejący projekt Supabase oznaczony jako **produkcyjny**, na planie **Free**, jako **drugi projekt na koncie** właściciela. Identyfikatora projektu świadomie nie powtarzamy w tym repozytorium, bo repozytorium jest publiczne. Jednocześnie zlecenie wymaga lokalnej implementacji, migracji, testów RLS i testów negatywnych — czyli operacji, które na projekcie produkcyjnym są nieakceptowalne:

- `supabase db reset` niszczy dane;
- testy RLS wymagają tworzenia i usuwania użytkowników w `auth.users`;
- seed danych demonstracyjnych zanieczyściłby bazę produkcyjną;
- plan Free nie daje Supabase Branching, a jego włączenie to koszt → bramka FinOps/ISKT.

## Decyzja

### 1. Cały development i wszystkie testy odbywają się na lokalnym stacku Supabase

Lokalny stack uruchamiany przez Supabase CLI w Dockerze: `supabase start`. Weryfikacja gotowości narzędzi na maszynie roboczej (2026-10-09):

| Narzędzie | Stan |
| --- | --- |
| Supabase CLI | `2.109.1` — zainstalowany |
| Docker Engine | `29.0.1` — demon działa |
| Obrazy Supabase | `postgres 17.6.1`, `gotrue`, `storage-api`, `realtime`, `studio` — obecne w lokalnym cache |
| Node.js | `25.5.0` lokalnie; dla spójności z CI wprowadzamy `.nvmrc` = `22` |

Dowód uruchomienia (`supabase start`, `supabase db reset` odtwarzający migracje od zera) jest elementem DoD Etapu 2, nie Etapu 0.

### 2. Twarde reguły wobec projektu produkcyjnego

Do czasu odrębnej decyzji ISKT w repozytorium i workspace **zabronione** są:

- `supabase link` do produkcyjnego projektu wskazanego w Project Access Card;
- `supabase db push`, `supabase db pull`, `supabase migration up --linked`, `supabase db dump` wobec projektu produkcyjnego;
- jakiekolwiek połączenie z produkcyjnym URL-em z kodu uruchamianego lokalnie, z testów lub z CI;
- umieszczanie w workspace produkcyjnych kluczy `anon`/`publishable`, `service_role` oraz hasła do bazy;
- zapisywanie danych demonstracyjnych lub testowych w projekcie produkcyjnym.

Plik `supabase/config.toml` jest wersjonowany **bez** `project_id` wskazującego produkcję; `supabase/.temp/` (gdzie CLI przechowuje stan linkowania) trafia do `.gitignore`.

### 3. Klucze i zmienne środowiskowe

- `.env.example` — tylko nazwy zmiennych i opis, zero wartości. Wersjonowany.
- `.env.local` — lokalne wartości, w `.gitignore`. Klucze wypisywane przez `supabase start` są deterministycznymi kluczami demonstracyjnymi lokalnego stacku i **nie są sekretem** — mimo to nie commitujemy ich, żeby nie uczyć złego nawyku.
- Sekrety produkcyjne (Supabase, Resend, hosting) przekazuje ISKT dopiero przed etapem wdrożenia, kanałem poza Paperclipem i poza repozytorium.

### 4. Ścieżka do środowisk nieprodukcyjnych (po decyzji ISKT)

Rekomendowana kolejność, gdy pojawi się potrzeba środowiska współdzielonego:

1. **Osobny projekt Supabase `szkolenia-iskt-dev`** na tym samym koncie — plan Free, zero danych osobowych, pełna swoboda `db reset`. Rekomendacja domyślna; koszt zerowy, ale to trzeci projekt na koncie → potwierdzenie ISKT z uwagi na limity planu Free.
2. **Supabase Branching** na projekcie produkcyjnym — wygodniejsze, ale wymaga planu płatnego → bramka FinOps/ISKT.
3. Projekt produkcyjny **wyłącznie** do finalnego wdrożenia, migracje aplikowane świadomie, po review i po backupie.

### 5. Poczta w środowisku lokalnym

`supabase start` udostępnia lokalny serwer pocztowy (Inbucket/Mailpit) obsługujący maile Auth. Dla powiadomień o zgłoszeniach wprowadzamy adapter wysyłki:

- `MAIL_TRANSPORT=log` (domyślny lokalnie) — treść maila w logu serwera, bez wysyłki;
- `MAIL_TRANSPORT=resend` — realna wysyłka; wymaga `RESEND_API_KEY`, czyli bramki ISKT.

Dzięki temu cały przepływ formularza jest testowalny lokalnie i w CI bez sekretu Resend i bez wysyłania maili na `biuro@iskt.pl` (szczegóły w [ADR-0004](ADR-0004-formularze-antyspam-resend.md)).

### 6. Dane w środowisku lokalnym

`supabase/seed.sql` zawiera wyłącznie dane fikcyjne, każdy rekord z prefiksem `[DEMO]` w polu tytułu/nazwy, adresy e-mail w domenie `example.invalid`. Zabronione jest użycie finalnych treści ISKT, prawdziwych nazwisk trenerów i jakichkolwiek realnych danych osobowych przed ich przekazaniem i zatwierdzeniem (zlecenie §4).

## Konsekwencje

- Etap 2 może wystartować bez żadnego sekretu od ISKT — odblokowuje to implementację natychmiast po zatwierdzeniu planu.
- CI nie wymaga dostępu do Supabase w chmurze: GitHub Actions uruchamia ten sam lokalny stack przez Supabase CLI.
- Migracje muszą być w 100% wersjonowane i odtwarzalne, bo lokalna baza jest jednorazowa — to pozytywny efekt wymuszony przez ADR-0003.
- Ryzyko rozjazdu lokalne ↔ produkcja pozostaje; mitygacja to wyłącznie migracje jako źródło prawdy schematu i zakaz ręcznych zmian w Studio na produkcji.

## Wymagana decyzja ISKT

1. Zatwierdzenie zakazu operacji wobec projektu produkcyjnego na tym etapie.
2. Czy utworzyć osobny projekt `szkolenia-iskt-dev` (opcja 1) już teraz, czy pozostać wyłącznie przy stacku lokalnym do momentu wdrożenia.
