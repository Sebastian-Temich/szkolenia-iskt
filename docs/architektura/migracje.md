# Migracje Supabase — wersjonowanie, odtwarzanie, dodawanie

- **Status:** opisuje stan faktyczny na 2026-10-10 (etap E9T)
- **Decyzje:** [ADR-0003 D9, D10](../adr/ADR-0003-model-danych-migracje-rls.md), [ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md)
- **Schemat:** [`model-danych.md`](model-danych.md) — co jest w migracjach
- **Uruchomienie lokalne:** [`../runbook/lokalne-uruchomienie.md`](../runbook/lokalne-uruchomienie.md)

Ten dokument opisuje **proces**: jak migracje są wersjonowane, jak odtworzyć schemat od zera i jak dodać nową. Zawartość samych migracji opisuje `model-danych.md`.

---

## 1. Zasada nadrzędna

**Migracje w `supabase/migrations/` są jedynym źródłem prawdy schematu.** Zakaz ręcznych zmian schematu w Supabase Studio — również lokalnie, bo zmiana wprowadzona w Studio nie istnieje dla nikogo poza autorem i ginie przy następnym `supabase db reset`.

**Migracje są forward-only.** Nie ma plików `down`. Cofnięcie zmiany realizuje się **nową migracją**, która ją odwraca. Każdy plik ma w nagłówku notę o odwracalności opisującą, co trzeba by zrobić, żeby zmianę wycofać.

**Nigdy nie edytuj migracji, która została scalona do `main`.** Hash pliku jest częścią stanu historii migracji; edycja po scaleniu powoduje rozjazd między środowiskami, którego `supabase db reset` nie wychwyci, bo buduje od zera. Do czasu scalenia do `main` edycja własnej, jeszcze nieopublikowanej migracji jest dopuszczalna — tak powstały poprawki ISK-356 w plikach `…120500` i `…120700`.

Wobec produkcyjnego projektu Supabase obowiązuje **zakaz** `supabase link`, `db push` i `db pull` ([ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md)). Wszystkie migracje były i są stosowane wyłącznie na lokalnych stackach Supabase CLI i w CI.

---

## 2. Wersjonowanie i nazewnictwo

Nazwa pliku to `<znacznik_czasu>_<opis>.sql`, gdzie znacznik czasu `YYYYMMDDHHMMSS` generuje CLI. Kolejność stosowania wynika z porządku leksykograficznego nazw, więc znacznik czasu **jest** numerem wersji.

Reguły z [ADR-0003 D9](../adr/ADR-0003-model-danych-migracje-rls.md):

1. **Jeden logiczny krok na plik.** Dlatego kolumna generowana `search_tsv` i jej indeksy są w osobnej migracji niż tabela `trainings`.
2. **Komentarz nagłówkowy w każdym pliku**, zawierający: cel, źródło (sekcja `model-danych.md` i/lub punkt ADR), notę o odwracalności, a gdy dotyczy — jawnie nazwane **odstępstwo** wobec specyfikacji wraz z uzasadnieniem. Odstępstwa zgłoszone w nagłówkach migracji `…120500` i `…120600` były podstawą oceny w bramce architektury (E2R) — ten mechanizm realnie zadziałał i warto go utrzymać.
3. **Polityki RLS w jednym pliku** (`…120700`), żeby przegląd bezpieczeństwa dał się przeczytać w jednym miejscu.

Stan na 2026-10-10 — osiem migracji:

| #   | Plik                                          | Zakres                                                                                                               |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | `20261009120100_extensions_and_helpers.sql`   | rozszerzenia, `immutable_unaccent()`, `set_updated_at()`                                                             |
| 2   | `20261009120200_admin_users_and_is_admin.sql` | `admin_users`, `is_admin()`                                                                                          |
| 3   | `20261009120300_catalog_tables.sql`           | `categories`, `trainers`, `trainings`, `training_trainers`, triggery `updated_at`, indeksy katalogowe                |
| 4   | `20261009120400_catalog_search.sql`           | `trainings.search_tsv`, indeks GIN, indeks trigramowy                                                                |
| 5   | `20261009120500_inquiries.sql`                | `inquiries`, `inquiry_status_history`, `enforce_inquiry_admin_update()` + trigger, `purge_expired_inquiries()`       |
| 6   | `20261009120600_audit_and_throttle.sql`       | `admin_audit_log`, `form_submission_throttle`, `purge_submission_throttle()`                                         |
| 7   | `20261009120700_rls_policies.sql`             | RLS na 9 tabelach, `REVOKE` dla ról klienckich, `GRANT`-y, wszystkie polityki                                        |
| 8   | `20261009120800_function_execute_grants.sql`  | odebranie `EXECUTE` od `PUBLIC` na funkcjach projektu, `purge_expired_audit_log()`, `admin_audit_log_details_no_pii` |

Migracja 8 to poprawka defektu krytycznego **ISK-356** — opis w [`model-danych.md` §4.2](model-danych.md#42-funkcje--macierz-której-pierwotna-specyfikacja-nie-zawierała).

Seed demonstracyjny to `supabase/seed.sql`, wczytywany **po** migracjach. Zawiera wyłącznie dane fikcyjne z prefiksem `[DEMO]`, zgodnie z [ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md) sekcja 6.

---

## 3. Odtworzenie schematu od zera

```bash
supabase db reset
```

Komenda wykonuje, w tej kolejności: odtworzenie bazy, `roles.sql`, **wszystkie** migracje w porządku nazw, `supabase/seed.sql`, restart kontenerów. Wymaga działającego stacku (`supabase start`).

Oczekiwane wyjście — osiem linii `Applying migration …` i jedna `Seeding data from supabase/seed.sql`:

```
Resetting local database...
Recreating database...
Initialising schema...
Seeding globals from roles.sql...
Applying migration 20261009120100_extensions_and_helpers.sql...
NOTICE (42710): extension "pgcrypto" already exists, skipping
Applying migration 20261009120200_admin_users_and_is_admin.sql...
Applying migration 20261009120300_catalog_tables.sql...
Applying migration 20261009120400_catalog_search.sql...
Applying migration 20261009120500_inquiries.sql...
Applying migration 20261009120600_audit_and_throttle.sql...
Applying migration 20261009120700_rls_policies.sql...
Applying migration 20261009120800_function_execute_grants.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
```

`NOTICE (42710): extension "pgcrypto" already exists` jest **oczekiwany** — Supabase instaluje `pgcrypto` w schemacie `extensions` w obrazie bazowym, a migracja 1 używa `create extension if not exists`. Nie jest to błąd.

**Dowód odtwarzalności jest automatyczny.** Zadanie `database` w `.github/workflows/ci.yml` wykonuje `supabase start` → `supabase db reset` → `npm run test:integration` na każdym PR i każdym pushu do `main`, na czystym runnerze. Każdy PR dowodzi więc, że migracje odtwarzają się od zera.

Przebieg trwa kilka minut. Krok „Initialising schema…” jest najdłuższy — to normalne, nie zawieszenie.

---

## 4. Dodanie nowej migracji

```bash
# 1. Nowy plik z poprawnym znacznikiem czasu
supabase migration new opis_zmiany

# 2. Wpisz SQL. Nagłówek jest obowiązkowy — wzór poniżej.

# 3. Sprawdź, że migracja odtwarza się OD ZERA, nie tylko stosuje na obecnym stanie
supabase db reset

# 4. Sprawdź, że polityki i uprawnienia nadal są takie, jak w macierzy
npm run test:integration

# 5. Commit pliku migracji RAZEM ze zmianą w kodzie, która go wymaga
```

Wzór nagłówka:

```sql
-- Migracja: <jedno zdanie, co robi>
-- Cel: <dlaczego; co bez tego nie działa lub jest niebezpieczne>
-- Zrodlo: docs/architektura/model-danych.md sekcja X; ADR-000Y DZ
-- Odwracalnosc: <odwracalna nową migracją / forward-only i dlaczego>
--
-- ODSTEPSTWO wzgledem model-danych.md (jesli wystepuje):
--   <co zrobiono inaczej, niż mówi specyfikacja, i dlaczego>
```

### Lista kontrolna, bez której nowa migracja jest niepełna

Wynika z defektów faktycznie popełnionych w tym projekcie. Każda pozycja ma za sobą zmierzony incydent.

- [ ] **Tworzysz tabelę?** Dodaj `enable row level security` **i** polityki **i** jawne `grant`-y. Nowa tabela bez tego ma RLS wyłączony i domyślne uprawnienia dla ról klienckich — patrz [`model-danych.md` §4.3](model-danych.md#43-znane-ograniczenie-domyślna-odmowa-jest-zdarzeniem-nie-niezmiennikiem).
- [ ] **Tworzysz funkcję w schemacie `public`?** Dodaj `revoke execute on function … from public, anon, authenticated;` **w tej samej migracji**, a potem minimalny `grant`. PostgreSQL nadaje każdej funkcji domyślny `EXECUTE TO PUBLIC`, a `public` jest wystawiony przez PostgREST — bez tego funkcja staje się publicznym endpointem RPC. To było źródło defektu ISK-356.
- [ ] **Nie używaj zbiorczego `revoke execute on all functions in schema public`** — `citext`, `pg_trgm` i `unaccent` są zainstalowane w `public` i zbiorcze odebranie psuje publiczny odczyt katalogu.
- [ ] **Funkcja `SECURITY DEFINER`?** Ustaw `set search_path = public, pg_temp` (z `pg_temp` na końcu) i uzasadnij w nagłówku, dlaczego `DEFINER`, a nie `INVOKER`.
- [ ] **Zmieniasz kolumny `inquiries`?** Sprawdź `enforce_inquiry_admin_update()`. Trigger jest **czarną listą**, więc nowa kolumna jest domyślnie edytowalna przez administratora — klasa błędu, która zawodzi otwarciem.
- [ ] **Dodajesz tabelę przechowującą cokolwiek związanego z osobą?** Ustal retencję w tej samej migracji i dodaj funkcję czyszczącą. `admin_audit_log` powstał bez retencji i wymagał osobnej poprawki.
- [ ] **Zmieniasz `search_tsv`, wagi albo słownik `unaccent`?** Przebuduj kolumnę i indeks GIN **oraz** zaktualizuj `unaccentPl()` w `lib/catalog.ts`. Kontrakt normalizacji jest rozdzielony między bazę i aplikację.
- [ ] **Dodajesz kontrolę bezpieczeństwa?** Dodaj do niej test negatywny w `tests/integration/`. Defekt ISK-356 przeszedł bramkę QA, bo poprawka i jej test nie trafiły na linię integracyjną razem.

---

## 5. Czego nie robimy

| Operacja                                                           | Dlaczego nie                                                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase link`, `db push`, `db pull` wobec projektu produkcyjnego | zakaz z [ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md), obowiązuje do odrębnej decyzji ISKT                                                                                     |
| zmiany schematu w Studio                                           | nie są wersjonowane; giną przy `db reset` i nie istnieją dla CI                                                                                                                               |
| edycja migracji scalonej do `main`                                 | rozjazd między środowiskami, którego `db reset` nie wychwyci                                                                                                                                  |
| pliki `down` / rollback                                            | migracje są forward-only; cofnięcie to nowa migracja                                                                                                                                          |
| `pg_cron` i automatyczne usuwanie danych                           | [ADR-0003 D8](../adr/ADR-0003-model-danych-migracje-rls.md) — nieodwracalne usuwanie przed zatwierdzeniem retencji przez administratora danych byłoby przedwczesne; włączenie to decyzja ISKT |

---

## 6. Zadania utrzymaniowe

Funkcje istnieją i działają, ale **nie są uruchamiane automatycznie** — `pg_cron` nie jest włączony. Wywołanie ręczne, rolą `service_role` (żadna z tych funkcji nie jest wykonywalna przez `anon` ani `authenticated`):

```sql
select public.purge_expired_inquiries();    -- zgłoszenia po retencji 12 miesięcy; zwraca liczbę usuniętych
select public.purge_submission_throttle();  -- liczniki antyspamowe starsze niż 24 h
select public.purge_expired_audit_log();    -- dziennik audytu starszy niż 24 miesiące (wartość domyślna)
```

> **To jest możliwość, nie egzekwowanie.** Dziś nie istnieje nic, co faktycznie usunie dane po terminie: ani harmonogram, ani przypisany właściciel, ani termin. Przed publikacją musi istnieć jedno z dwojga — włączony harmonogram albo procedura z imiennie wskazanym właścicielem, cyklem i rejestrem wykonań. Pozycje **I6**, **I9** i **I10** w [skonsolidowanej liście ISKT](../odbior/braki-i-decyzje-iskt.md). Dodatkowo dwie kopie danych osobowych są poza zasięgiem tych funkcji — skrzynka odbiorcy powiadomień i panel Resend (pozycje **I7**, **I8**).
