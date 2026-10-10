# ADR-0002 — Środowisko lokalne i bezpieczna praca z produkcyjnym projektem Supabase

- **Status:** **zatwierdzony przez ISKT 2026-10-09** (bramka planu zamknięta). Zweryfikowany wobec kodu 2026-10-10 w etapie E9T — patrz „Stan implementacji (E9T)” na końcu dokumentu.
- **Data:** 2026-10-09 (decyzja), 2026-10-10 (weryfikacja wobec implementacji)
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

| Narzędzie       | Stan                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------ |
| Supabase CLI    | `2.109.1` — zainstalowany                                                                  |
| Docker Engine   | `29.0.1` — demon działa                                                                    |
| Obrazy Supabase | `postgres 17.6.1`, `gotrue`, `storage-api`, `realtime`, `studio` — obecne w lokalnym cache |
| Node.js         | `25.5.0` lokalnie; dla spójności z CI wprowadzamy `.nvmrc` = `22`                          |

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

> **Rozstrzygnięcie:** punkt 1 zatwierdzony przez ISKT 2026-10-09. Punkt 2 pozostaje **otwarty** — cały MVP powstał bez środowiska współdzielonego, więc decyzja nie blokowała dostawy; pozycja przeniesiona do [skonsolidowanej listy ISKT](../odbior/braki-i-decyzje-iskt.md).

---

## Stan implementacji (E9T, 2026-10-10)

Sekcja dopisana w etapie E9T. Treść decyzji powyżej pozostaje bez zmian.

### 1. Zakaz operacji na projekcie produkcyjnym — dotrzymany

Potwierdzone niezależnie w dwóch bramkach:

- **E7 (security review):** skan wszystkich gałęzi i całej historii Git — zero wartości sekretów, zero identyfikatorów środowisk; `.env.example` zawiera wyłącznie nazwy i opisy.
- **E8 (zgodność RODO):** historia wszystkich gałęzi nie zawiera żadnego pliku `.env` poza `.env.example`.

Żadna bramka ani żaden etap nie wykonał `supabase link`, `db push` ani `db pull`. Wszystkie weryfikacje (E2, E2R, E6, E7, E8, E9T) biegły na izolowanych, lokalnych stackach Supabase CLI.

**Jedno zdarzenie blisko granicy, warte zapisania:** w bramce QA (E6) wykryto defekt **BLK-1** — helper `stackEnv()` w `tests/integration/helpers/supabase.ts` czytał `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` **przed** lokalnymi `API_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY`. Na maszynie roboczej te pierwsze są ustawione i wskazują projekt hostowany, więc `npm run test:integration` celowałby tam — razem z zapisami i usuwaniem danych kluczem `service_role`. Zadziałała dodana w E6 bramka hermetyczności: przebieg zatrzymał się **przed pierwszym zapytaniem**, więc projekt zdalny nie został dotknięty. Naprawa (ISK-358) jest w `tests/integration/helpers/supabase.ts` i w `tests/integration/hermeticity.test.ts`: **lokalny stack zawsze wygrywa**, a hostowany URL w środowisku powoduje twardy błąd przed jakimkolwiek requestem. Wniosek do zapamiętania: reguła z tego ADR potrzebuje egzekwowalnej bramki w kodzie, nie tylko zapisu w dokumencie.

### 2. Weryfikacja narzędzi — stan na 2026-10-10

| Narzędzie     | Deklaracja z 2026-10-09            | Stan 2026-10-10                                                                                                                        |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase CLI  | `2.109.1`                          | `2.109.1` (ta sama wersja przypięta w CI przez `supabase/setup-cli@v1`)                                                                |
| Docker Engine | `29.0.1`                           | `29.0.1`                                                                                                                               |
| Postgres      | `17.6.1`                           | `major_version = 17` w `supabase/config.toml`                                                                                          |
| Node.js       | `25.5.0` lokalnie, `.nvmrc` = `22` | bez zmian; **`nvm` nie jest zainstalowany na maszynie roboczej**, więc krok `nvm use` z runbooku nie działa — runbook poprawiony w E9T |

### 3. Porty lokalnego stacku — odstępstwo operacyjne

`supabase/config.toml` w repozytorium używa **domyślnego bloku portów CLI** (`54320`–`54329`). Przy kilku równoległych stackach na jednej maszynie `supabase start` kończy się `Bind for 0.0.0.0:54322 failed: port is already allocated` — odtworzone w bramce architektury (**E2R, ustalenie C8**) i ponownie w E9T. Nie zmieniamy portów w repozytorium (CI startuje na czystym runnerze i domyślne porty są tam poprawne); **obejście jest udokumentowane w [runbooku](../runbook/lokalne-uruchomienie.md#kilka-stacków-na-jednej-maszynie)**: kopia robocza `supabase/config.toml` z własnym `project_id` i przesuniętym blokiem portów. Helpery testowe czytają porty dynamicznie z `supabase status -o env`, więc dotyczy to wyłącznie `supabase start`.

### 4. Nazwy kluczy w wyjściu `supabase status`

CLI `2.109.1` wypisuje **dwa zestawy** poświadczeń: starsze `ANON_KEY` / `SERVICE_ROLE_KEY` (JWT) oraz nowsze `PUBLISHABLE_KEY` / `SECRET_KEY` (`sb_publishable_…` / `sb_secret_…`). Aplikacja i testy używają zestawu JWT (`ANON_KEY`, `SERVICE_ROLE_KEY`). Runbook wskazuje to jawnie, żeby nie wkleić pary nowszej do zmiennych oczekujących JWT.

Lokalny serwer pocztowy jest dziś **Mailpit** (`supabase status` podaje go pod `MAILPIT_URL` i — dla zgodności — pod `INBUCKET_URL`, oba na tym samym porcie).

### 5. Dane w środowisku lokalnym — zgodne z decyzją

`supabase/seed.sql` zawiera wyłącznie dane fikcyjne: 5 kategorii, 2 trenerów, 3 szkolenia, 2 powiązania. Każdy rekord ma prefiks `[DEMO]`, adresy e-mail (gdy występują) są w domenie `example.invalid`, `photo_url` jest `NULL`. Potwierdzone w bramkach E7 i E8.
