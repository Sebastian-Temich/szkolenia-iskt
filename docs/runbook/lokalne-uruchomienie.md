# Runbook — lokalne uruchomienie

- **Status:** **przejdzony krok po kroku na czystym katalogu 2026-10-10** (etap E9T) na macOS 25.6, Node 25.5.0, Docker 29.0.1, Supabase CLI 2.109.1. Kroki, które nie działały, są poprawione; pułapki opisane w sekcji [Rozwiązywanie problemów](#rozwiązywanie-problemów).
- **Decyzje:** [ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md)
- **Procedura migracji:** [`../architektura/migracje.md`](../architektura/migracje.md)

## Zasada nadrzędna

Całość pracy odbywa się na **lokalnym stacku Supabase**. Istniejący projekt Supabase ISKT (identyfikator w Project Access Card, poza repozytorium) jest oznaczony jako produkcyjny — obowiązuje zakaz linkowania, `db push`, `db pull` i jakichkolwiek operacji na nim do czasu odrębnej decyzji ISKT.

## Wymagania

| Narzędzie    | Wersja                                                        | Sprawdzenie          |
| ------------ | ------------------------------------------------------------- | -------------------- |
| Node.js      | **22 LTS** (`.nvmrc`, `engines` w `package.json`: `>=22 <23`) | `node -v`            |
| npm          | 10+                                                           | `npm -v`             |
| Docker       | działający demon                                              | `docker info`        |
| Supabase CLI | 2.x (zweryfikowane na `2.109.1`)                              | `supabase --version` |
| `psql`       | dowolna 14+ (do zadań utrzymaniowych i diagnostyki)           | `psql --version`     |

**O wersji Node — przeczytaj, zanim uruchomisz `npm ci`.** Repozytorium deklaruje Node 22, bo tyle ma CI. Maszyna robocza projektu ma Node **25.5.0** i **nie ma zainstalowanego `nvm`** ani innego menedżera wersji, więc krok `nvm use` z poprzedniej wersji tego runbooku **nie działa** — kończy się `command not found`.

- Masz `nvm`: `nvm install && nvm use` (czyta `.nvmrc`).
- Nie masz menedżera wersji: **możesz pracować na Node 25.** `npm ci` kończy się sukcesem, ale wypisuje ostrzeżenia `EBADENGINE` dla `vitest` i kilku pakietów tranzytywnych. Cały zestaw testów i `npm run build` przechodzą. Ostrzeżenia są oczekiwane, nie są błędem — nie próbuj ich „naprawiać" przez `--force` ani przez edycję `engines`.
- Rozbieżność lokalne (25) ↔ CI (22) jest świadomym długiem; weryfikacja ostateczna należy do CI.

## Pierwsze uruchomienie

```bash
# 1. Zależności
npm ci
#    Node 22: wcześniej `nvm install && nvm use`
#    Node 25: ostrzeżenia EBADENGINE są oczekiwane (patrz wyżej)

# 2. Lokalny stack Supabase (Postgres, Auth, Studio, poczta lokalna)
supabase start
#    Pierwsze uruchomienie pobiera obrazy — potrafi zająć kilka minut.
#    Jeśli dostaniesz błąd zajętego portu, przejdź do sekcji
#    „Kilka stacków na jednej maszynie" NIŻEJ, zanim spróbujesz ponownie.

# 3. Zmienne środowiskowe
cp .env.example .env.local
supabase status           # wypisuje adresy i klucze lokalnego stacku
#    Do .env.local wklej:
#      NEXT_PUBLIC_SUPABASE_URL      <- API_URL
#      NEXT_PUBLIC_SUPABASE_ANON_KEY <- ANON_KEY
#      SUPABASE_SERVICE_ROLE_KEY     <- SERVICE_ROLE_KEY
#      NEXT_PUBLIC_SITE_URL          <- http://localhost:3000
#      MAIL_TRANSPORT                <- log
#      INQUIRY_NOTIFICATION_TO       <- dowolny adres w domenie example.invalid
#      RODO_CLAUSE_VERSION           <- pozostaw puste (kod użyje DRAFT-0-niezatwierdzona)
#    Wygeneruj dwa sekrety antyspamowe (min. 32 znaki każdy):
openssl rand -hex 32   # -> FORM_THROTTLE_SALT
openssl rand -hex 32   # -> FORM_TOKEN_SECRET
#    RESEND_API_KEY i RESEND_FROM pozostaw puste — to bramka ISKT.

# 4. Schemat i dane demonstracyjne
supabase db reset      # odtwarza 8 migracji od zera + supabase/seed.sql

# 5. Aplikacja
npm run dev            # http://localhost:3000
```

> **Dwa zestawy kluczy w wyjściu `supabase status` — nie pomyl ich.** CLI 2.109.1 wypisuje zarówno starsze `ANON_KEY` / `SERVICE_ROLE_KEY` (tokeny JWT, zaczynają się od `eyJ…`), jak i nowsze `PUBLISHABLE_KEY` / `SECRET_KEY` (`sb_publishable_…` / `sb_secret_…`). **Aplikacja i testy używają zestawu JWT.** Wklejenie pary nowszej daje błąd uwierzytelnienia, którego komunikat nie wskazuje przyczyny.

> Klucze lokalnego stacku są deterministyczne i **nie są sekretem** ([ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md) sekcja 3) — mimo to nie commitujemy ich. `.env.local` jest w `.gitignore`.

Walidacja konfiguracji odbywa się w `lib/env.ts`. Zmienne publiczne i serwerowe mają osobne schematy Zod. Brak wymaganej zmiennej powoduje czytelny błąd z nazwą pola, bez wypisywania wartości. Klucze serwerowe są sprawdzane dopiero przy tworzeniu klienta, który ich wymaga, dlatego `npm run build` i bramki jakości nie potrzebują sekretów.

## Kilka stacków na jednej maszynie

`supabase/config.toml` w repozytorium używa **domyślnego bloku portów CLI** (`54320`–`54329`) i tak ma zostać — CI startuje na czystym runnerze i domyślne porty są tam poprawne. Na maszynie, na której działa już inny lokalny stack Supabase, `supabase start` kończy się:

```
Bind for 0.0.0.0:54322 failed: port is already allocated
```

Nie zmieniaj portów w pliku wersjonowanym. Zrób **kopię roboczą** poza repozytorium:

```bash
# Katalog roboczy z własnym project_id i przesuniętym blokiem portów
cp -R supabase /tmp/moj-stack-supabase
cd /tmp/moj-stack-supabase
#   w config.toml: project_id = "moj-stack", a każdy `port = 543XX` przesuń
#   o ten sam offset (np. +180 → 54501, 54502, 54503, 54504, 54500 dla shadow_port)
supabase start
```

Potem wskazuj ten katalog skryptom pomocniczym:

```bash
SUPABASE_DIR=/tmp/moj-stack-supabase ./scripts/integration-local.sh
SUPABASE_DIR=/tmp/moj-stack-supabase ./scripts/e2e-local.sh
```

Helpery testowe czytają porty **dynamicznie** z `supabase status -o env`, więc kolizja dotyka wyłącznie `supabase start`. Ustalenie pochodzi z bramki architektury (E2R, C8) i zostało odtworzone w E9T.

> **Przy dużej liczbie równoległych stacków Docker zaczyna zabijać kontenery z powodu pamięci** — pierwszym ofiarą jest zwykle `analytics` (`supabase_analytics_*`), co przerywa `supabase start` i wycofuje cały przebieg. Oba kontenery, `analytics` i `storage.vector`, są zbędne do pracy ze schematem, RLS i aplikacją; w kopii roboczej `config.toml` ustaw im `enabled = false`. **Nie commituj tej zmiany.**

## Konto administratora w środowisku lokalnym

Konto produkcyjne ustanawia ISKT. Lokalnie tworzysz własne konto testowe:

```bash
# 1. Użytkownik w lokalnym Auth
supabase auth admin create-user --email admin@example.invalid --password '<lokalne-haslo>'

# 2. Nadanie uprawnień administratora (podstaw UUID z komendy powyżej)
psql "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" \
  -c "insert into public.admin_users (user_id, label) values ('<uuid>', 'lokalne konto testowe');"
```

Hasła lokalnego konta nie zapisujemy w repozytorium, dokumentacji ani w zadaniach.

> **Uprawnienie administratora to wiersz w `admin_users`, nie claim w JWT** ([ADR-0003 D6](../adr/ADR-0003-model-danych-migracje-rls.md)). Samo utworzenie użytkownika daje sesję, która przechodzi `proxy.ts`, ale `requireAdmin()` odesłałoby ją na `/panel/brak-dostepu`. Bez kroku 2 panel nie zadziała.
>
> **Limit GoTrue, na który łatwo nadepnąć:** lokalny Auth ogranicza liczbę logowań (rzędu 30 na 5 minut). Przy wielokrotnym uruchamianiu zestawu E2E objawia się to błędem logowania, który wygląda jak defekt aplikacji. Odczekaj albo użyj jednej sesji na przebieg.

## Codzienne komendy

| Komenda                           | Działanie                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                     | serwer deweloperski (`next dev --webpack`)                                     |
| `npm run lint`                    | ESLint, `--max-warnings=0`                                                     |
| `npm run typecheck`               | `tsc --noEmit`                                                                 |
| `npm run test:unit`               | Vitest — testy jednostkowe (bez usług zewnętrznych)                            |
| `npm run test:integration`        | Vitest + lokalny Supabase — RLS, triggery, uprawnienia funkcji, zapis zgłoszeń |
| `npm run test:e2e`                | Playwright — 9 krytycznych ścieżek + skan axe                                  |
| `npm run build`                   | build produkcyjny (`next build --webpack`)                                     |
| `npm run format` / `format:check` | Prettier (**uwaga:** `format:check` nie jest uruchamiany w CI)                 |
| `supabase db reset`               | odtworzenie schematu od zera i seed                                            |
| `supabase migration new <nazwa>`  | nowy plik migracji                                                             |
| `supabase stop`                   | zatrzymanie stacku (dane zachowane)                                            |
| `supabase stop --no-backup`       | zatrzymanie i wyczyszczenie danych                                             |

### Testy — czytaj, zanim uruchomisz

```bash
npm run test:unit                  # bezpieczne zawsze

./scripts/integration-local.sh     # UŻYWAJ TEGO, nie `npm run test:integration`
./scripts/e2e-local.sh             # UŻYWAJ TEGO, nie `npm run test:e2e`
```

**Dlaczego przez skrypty, a nie bezpośrednio.** Helper `stackEnv()` czyta `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, a te na maszynie deweloperskiej potrafią wskazywać **projekt hostowany**. Bez nadpisania ich wartościami lokalnymi testy — razem z zapisami i usuwaniem danych kluczem `service_role` — celowałyby w zdalną bazę. Skrypty eksportują wartości z `supabase status` lokalnego stacku, więc **lokalny stack zawsze wygrywa**. Dodatkowo bramka hermetyczności (`tests/integration/hermeticity.test.ts`) przerywa przebieg **przed pierwszym zapytaniem**, jeśli w środowisku jest hostowany URL. To zabezpieczenie powstało po realnym incydencie (defekt BLK-1 z bramki QA, naprawa ISK-358) — nie obchodź go.

Zestaw E2E domyślnie startuje `npm run dev`. Żeby testować artefakt builda (tak jak CI), ustaw `PLAYWRIGHT_USE_BUILD=1`.

Dowody RWD z `tests/e2e/visual-evidence.spec.ts` są **pomijane**, dopóki nie ustawisz `EVIDENCE_DIR` — celowo, żeby CI nie produkowało 30 plików PNG przy każdym przebiegu. Pominięte przypadki w podsumowaniu Playwrighta to normalny stan, nie ukryta porażka.

## Podglądanie poczty

- **Maile Auth** (reset hasła, zaproszenia): lokalna skrzynka **Mailpit**; adres w `supabase status` pod `MAILPIT_URL` (oraz, dla zgodności, pod `INBUCKET_URL` — ten sam port).
- **Powiadomienia o zgłoszeniach** przy `MAIL_TRANSPORT=log`: treść i odbiorca w logu `npm run dev`, jako wpis JSON. Lokalna skrzynka ich **nie dostaje** — transport `log` niczego nie wysyła.
- **Realna wysyłka przez Resend** wymaga `RESEND_API_KEY` i `RESEND_FROM` — bramka ISKT. Do tego czasu nie wysyłamy nic na adres biura.

## Zmiana schematu bazy

Pełna procedura, lista kontrolna i wzór nagłówka migracji: [`../architektura/migracje.md`](../architektura/migracje.md). Skrót:

1. `supabase migration new opis_zmiany`
2. Wpisz SQL; dodaj komentarz nagłówkowy z celem, źródłem i notą o odwracalności.
3. `supabase db reset` — weryfikacja, że migracja odtwarza się **od zera**.
4. `./scripts/integration-local.sh` — weryfikacja polityk RLS i uprawnień funkcji.
5. Commit pliku migracji razem ze zmianą w kodzie.

**Nigdy nie edytuj migracji scalonej do `main`** — dodaj nową. **Tworzysz funkcję w schemacie `public`?** Odbierz jej `EXECUTE` od `PUBLIC` w tej samej migracji; bez tego staje się publicznym endpointem RPC (to było źródło defektu krytycznego ISK-356).

Zakaz ręcznych zmian schematu w Supabase Studio: migracje są jedynym źródłem prawdy ([ADR-0003 D9](../adr/ADR-0003-model-danych-migracje-rls.md)).

## Zadania utrzymaniowe (uruchamiane ręcznie)

Funkcje są wykonywalne **wyłącznie** przez rolę `service_role` — przez `psql` jako `postgres` albo przez klienta z kluczem `service_role`. Wywołanie kluczem `anon` zwraca `401` (sprawdzone).

```sql
select public.purge_expired_inquiries();    -- zgłoszenia po retencji 12 miesięcy; zwraca liczbę usuniętych
select public.purge_submission_throttle();  -- liczniki antyspamowe starsze niż 24 h
select public.purge_expired_audit_log();    -- dziennik audytu starszy niż 24 miesiące (wartość domyślna)
```

Harmonogram (`pg_cron`) **nie jest włączony** w MVP — wymaga decyzji ISKT ([ADR-0003 D8](../adr/ADR-0003-model-danych-migracje-rls.md)).

> **To jest możliwość, nie egzekwowanie.** Dziś nie ma nic, co faktycznie usunie dane po terminie. Przed publikacją musi istnieć harmonogram albo procedura z imiennie wskazanym właścicielem, cyklem i rejestrem wykonań. Dodatkowo **dwie kopie danych są poza zasięgiem tych funkcji**: skrzynka odbiorcy powiadomień i panel/logi Resend — powiadomienie zawiera imię i nazwisko, e-mail, telefon, firmę i pełną treść wiadomości. Procedura retencji musi obejmować obie. Pozycje **I6**–**I10** w [skonsolidowanej liście ISKT](../odbior/braki-i-decyzje-iskt.md).

## Rozwiązywanie problemów

| Objaw                                                                                                 | Przyczyna i działanie                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nvm: command not found` przy kroku 1                                                                 | `nvm` nie jest zainstalowany. Pracuj na obecnym Node — patrz [Wymagania](#wymagania).                                                                                                                                                                                                                                                                                                                                                      |
| `npm warn EBADENGINE` przy `npm ci`                                                                   | Node poza przedziałem `engines` (`>=22 <23`). Oczekiwane na Node 25; `npm ci` kończy się sukcesem. Nie używaj `--force`.                                                                                                                                                                                                                                                                                                                   |
| `supabase start`: `Bind for 0.0.0.0:54322 failed: port is already allocated`                          | inny lokalny stack trzyma domyślny blok portów. `docker ps`, a następnie [kopia robocza z przesuniętymi portami](#kilka-stacków-na-jednej-maszynie).                                                                                                                                                                                                                                                                                       |
| `supabase start` wycofuje się po kilku minutach, a w logu Dockera widać zabity `supabase_analytics_*` | Docker VM wyczerpał pamięć (praktyczny limit to kilka równoległych stacków). Wyłącz `analytics` i `storage.vector` w **kopii roboczej** `config.toml`.                                                                                                                                                                                                                                                                                     |
| `supabase start` nie startuje wcale                                                                   | demon Dockera nie działa — uruchom Docker Desktop, potwierdź `docker info`.                                                                                                                                                                                                                                                                                                                                                                |
| `supabase db reset` stoi długo na „Initialising schema…"                                              | normalne; cały przebieg zajmuje kilka minut. Oczekiwane wyjście to 8 linii `Applying migration …` i jedna `Seeding data …`.                                                                                                                                                                                                                                                                                                                |
| `NOTICE (42710): extension "pgcrypto" already exists, skipping`                                       | oczekiwane — Supabase instaluje `pgcrypto` w obrazie bazowym. Nie jest to błąd.                                                                                                                                                                                                                                                                                                                                                            |
| `supabase db reset` zgłasza konflikt migracji                                                         | migracja była edytowana po scaleniu — przywróć plik i dodaj nową migrację.                                                                                                                                                                                                                                                                                                                                                                 |
| Testy integracyjne przerywają się komunikatem o hostowanym `SUPABASE_URL`                             | **bramka hermetyczności zadziałała poprawnie.** W środowisku jest URL projektu hostowanego. Uruchom przez `./scripts/integration-local.sh`.                                                                                                                                                                                                                                                                                                |
| Aplikacja zwraca 401/403 na publicznych danych                                                        | brak polityki publicznego odczytu albo rekord nie ma `is_published = true`                                                                                                                                                                                                                                                                                                                                                                 |
| Katalog jest pusty, a baza ma dane                                                                    | brak `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` w `.env.local`. Poza fazą builda to twardy błąd, nie cichy pusty katalog — sprawdź log serwera.                                                                                                                                                                                                                                                                                               |
| Wyszukiwanie nie znajduje nic dla frazy z polskimi znakami                                            | `search_tsv` jest zbudowana na tekście po `unaccent`, więc fraza musi przejść `unaccentPl()` z `lib/catalog.ts`. Jeśli zmieniałeś jedną stronę, zmień drugą.                                                                                                                                                                                                                                                                               |
| Zapis formularza zwraca 500 `server_misconfigured`                                                    | brak `FORM_TOKEN_SECRET`, `FORM_THROTTLE_SALT` lub `INQUIRY_NOTIFICATION_TO` w `.env.local`. Sekrety antyspamowe muszą mieć **min. 32 znaki**.                                                                                                                                                                                                                                                                                             |
| Formularz pokazuje potwierdzenie, ale w bazie nie ma wiersza                                          | odrzucenie antyspamowe zwraca `200` z komunikatem sukcesu (celowo — nie informujemy bota). Najczęściej to `MIN_FILL_MS = 3 s`: wysłanie szybciej niż 3 sekundy po renderze strony. Odczekaj.                                                                                                                                                                                                                                               |
| Powiadomienie nie dociera do lokalnej skrzynki                                                        | przy `MAIL_TRANSPORT=log` jest to oczekiwane — treść jest w logu serwera, nie w Mailpit.                                                                                                                                                                                                                                                                                                                                                   |
| Logowanie do panelu nie działa po wielu próbach                                                       | limit częstości logowań w lokalnym GoTrue (rzędu 30 / 5 min). Odczekaj.                                                                                                                                                                                                                                                                                                                                                                    |
| Zalogowanie się udaje, ale panel przekierowuje na `/panel/brak-dostepu`                               | brak wiersza w `admin_users` dla tego użytkownika — patrz [Konto administratora](#konto-administratora-w-środowisku-lokalnym).                                                                                                                                                                                                                                                                                                             |
| `npm run format:check` pokazuje wiele plików do sformatowania                                         | stan znany i **nieobjęty bramką CI**. Nie przeformatowuj całego repozytorium — zadbaj o format wyłącznie w plikach, które sam zmieniasz.                                                                                                                                                                                                                                                                                                   |
| Konsola przeglądarki: `Refused to load/execute … Content Security Policy`                             | CSP jest wymuszana od ISK-360, definiowana w `next.config.ts` (wartości w `lib/security/headers.ts`). Nowy zewnętrzny skrypt, font, obraz albo `<iframe>` wymaga dopisania źródła do właściwej dyrektywy — nie obchodź tego przez `'unsafe-inline'`. Na `/panel/*` skrypty inline muszą nosić nonce z `proxy.ts`, więc **każda trasa panelu musi być dynamiczna**; prerenderowana nie dostanie nonce i w trybie dev nie będzie tego widać. |
