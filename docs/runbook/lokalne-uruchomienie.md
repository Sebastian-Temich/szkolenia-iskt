# Runbook — lokalne uruchomienie

- **Status:** obowiązuje od Etapu 1; sekcje oznaczone „(Etap 2)” działają po wdrożeniu migracji
- **Decyzje:** [ADR-0002](../adr/ADR-0002-srodowisko-lokalne-i-supabase.md)

## Zasada nadrzędna

Całość pracy odbywa się na **lokalnym stacku Supabase**. Istniejący projekt Supabase ISKT (identyfikator w Project Access Card, poza repozytorium) jest oznaczony jako produkcyjny — obowiązuje zakaz linkowania, `db push`, `db pull` i jakichkolwiek operacji na nim do czasu odrębnej decyzji ISKT.

## Wymagania

| Narzędzie    | Wersja minimalna            | Sprawdzenie          |
| ------------ | --------------------------- | -------------------- |
| Node.js      | 22 LTS (zgodnie z `.nvmrc`) | `node -v`            |
| npm          | 10+                         | `npm -v`             |
| Docker       | działający demon            | `docker info`        |
| Supabase CLI | 2.x                         | `supabase --version` |

## Pierwsze uruchomienie

```bash
# 1. Zależności
nvm use            # czyta .nvmrc
npm ci

# 2. Lokalny stack Supabase (Postgres, Auth, Studio, poczta lokalna)
supabase start
#    CLI wypisze: API URL, anon key, service_role key, Studio URL, Inbucket URL

# 3. Zmienne środowiskowe
cp .env.example .env.local
#    wklej API URL, anon key i service_role key z wyjścia `supabase start`
#    wygeneruj sekrety antyspamowe:
openssl rand -hex 32   # -> FORM_THROTTLE_SALT
openssl rand -hex 32   # -> FORM_TOKEN_SECRET
#    pozostaw MAIL_TRANSPORT=log i puste RESEND_*

# 4. Schemat i dane demonstracyjne (Etap 2)
supabase db reset      # odtwarza wszystkie migracje od zera + supabase/seed.sql

# 5. Aplikacja
npm run dev            # http://localhost:3000
```

Walidacja konfiguracji odbywa się w `lib/env.ts`. Zmienne publiczne i serwerowe mają osobne schematy Zod. Brak wymaganej zmiennej powoduje czytelny błąd z nazwą pola, bez wypisywania wartości. Klucze serwerowe są sprawdzane dopiero przy tworzeniu klienta, który ich wymaga, dlatego build i bramki jakości nie potrzebują sekretów.

## Konto administratora w środowisku lokalnym (Etap 2)

Konto produkcyjne ustanawia ISKT. Lokalnie tworzysz własne konto testowe:

```bash
# Użytkownik w lokalnym Auth
supabase auth admin create-user --email admin@example.invalid --password '<lokalne-haslo>'

# Nadanie uprawnień administratora (podstaw UUID z komendy powyżej)
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
  -c "insert into public.admin_users (user_id, label) values ('<uuid>', 'lokalne konto testowe');"
```

Hasła lokalnego konta nie zapisujemy w repozytorium, dokumentacji ani w zadaniach.

## Codzienne komendy

| Komenda                          | Działanie                                        |
| -------------------------------- | ------------------------------------------------ |
| `npm run dev`                    | serwer deweloperski                              |
| `npm run lint`                   | ESLint                                           |
| `npm run typecheck`              | `tsc --noEmit`                                   |
| `npm run test:unit`              | Vitest — testy jednostkowe                       |
| `npm run test:integration`       | Vitest + lokalny Supabase — RLS i zapis zgłoszeń |
| `npm run test:e2e`               | Playwright — krytyczne ścieżki + skan axe        |
| `npm run build`                  | build produkcyjny                                |
| `supabase db reset`              | odtworzenie schematu od zera i seed              |
| `supabase migration new <nazwa>` | nowy plik migracji                               |
| `supabase stop`                  | zatrzymanie stacku (dane zachowane)              |
| `supabase stop --no-backup`      | zatrzymanie i wyczyszczenie danych               |

## Testy Etapu 1

```bash
npm run test:unit        # testy bez usług zewnętrznych
npm run test:integration # lokalny Supabase; w E1 dopuszcza brak testów
npm run test:e2e         # uruchamia Next.js i Chromium, zawiera smoke + axe
```

CI pobiera URL i klucze wyłącznie z uruchomionego przez siebie stacku `supabase start`. Nie korzysta z sekretów GitHub Actions ani z projektu zdalnego.

## Podglądanie poczty

- Maile Auth (reset hasła, zaproszenia): lokalna skrzynka Inbucket/Mailpit, adres z `supabase status`.
- Powiadomienia o zgłoszeniach przy `MAIL_TRANSPORT=log`: treść i odbiorca w logu `npm run dev`.
- Realna wysyłka przez Resend wymaga `RESEND_API_KEY` — bramka ISKT. Do tego czasu nie wysyłamy nic na `biuro@iskt.pl`.

## Zmiana schematu bazy

1. `supabase migration new opis_zmiany`
2. Wpisz SQL do nowego pliku w `supabase/migrations/`; dodaj komentarz nagłówkowy z celem i powiązanym ADR.
3. `supabase db reset` — weryfikacja, że migracja odtwarza się od zera.
4. `npm run test:integration` — weryfikacja polityk RLS.
5. Commit pliku migracji razem ze zmianą w kodzie. **Nigdy nie edytuj już scalonej migracji** — dodaj nową.

Zakaz ręcznych zmian schematu w Supabase Studio: migracje są jedynym źródłem prawdy (ADR-0003 D9).

## Zadania utrzymaniowe (uruchamiane ręcznie)

```sql
select public.purge_expired_inquiries();   -- usunięcie zgłoszeń po retencji 12 miesięcy
select public.purge_submission_throttle(); -- czyszczenie liczników antyspamowych > 24 h
```

Harmonogram (`pg_cron`) nie jest włączony w MVP — wymaga decyzji ISKT (ADR-0003 D8).

## Rozwiązywanie problemów

| Objaw                                          | Przyczyna i działanie                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `supabase start` kończy się błędem portów      | inny stack działa — `supabase stop`, sprawdź `docker ps`                      |
| `supabase start` nie startuje                  | demon Dockera nie działa — uruchom Docker Desktop, potwierdź `docker info`    |
| Aplikacja zwraca 401/403 na publicznych danych | brakuje polityki publicznego odczytu albo rekord nie ma `is_published = true` |
| Zapis formularza zwraca 500                    | brak `SUPABASE_SERVICE_ROLE_KEY` lub `FORM_TOKEN_SECRET` w `.env.local`       |
| Powiadomienie nie dociera                      | przy `MAIL_TRANSPORT=log` to oczekiwane — sprawdź log serwera                 |
| `supabase db reset` zgłasza konflikt migracji  | migracja była edytowana po scaleniu — przywróć plik i dodaj nową migrację     |
