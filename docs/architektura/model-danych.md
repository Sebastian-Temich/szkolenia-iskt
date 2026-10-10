# Model danych, RLS i migracje — szkolenia.iskt.pl

- **Status:** **opisuje stan faktyczny** schematu po etapie E2 i poprawce ISK-356, zweryfikowany wobec plików w `supabase/migrations/` oraz wobec działającej bazy po `supabase db reset` (E9T, 2026-10-10)
- **Data:** 2026-10-09 (specyfikacja wejściowa), **2026-10-10** (uzgodnienie z implementacją w etapie E9T)
- **Decyzje:** [ADR-0003](../adr/ADR-0003-model-danych-migracje-rls.md)
- **Procedura migracji:** [`migracje.md`](migracje.md)
- **Implementacja:** Etap 2 — Inżynier Backend / Supabase; bramki: E2R (architektura), E7 (security), E8 (RODO)

Dokument powstał jako specyfikacja wejściowa dla migracji. W etapie **E9T** został uzgodniony z faktycznymi migracjami: **źródłem prawdy jest teraz `supabase/migrations/`**, a ten dokument opisuje, co tam jest. Miejsca, w których pierwotna specyfikacja różniła się od implementacji, są oznaczone jako **odstępstwo** i nie zostały wyciszone.

---

## 1. Diagram relacji

```
auth.users ──1:1── admin_users
                      │
categories ──1:N── trainings ──N:M── trainers
                      │  (training_trainers)
                      │
                      └──0:N── inquiries ──1:N── inquiry_status_history
                                              (on delete cascade)

admin_audit_log            (niezależna, dziennik operacji; entity_id BEZ klucza obcego)
form_submission_throttle   (niezależna, techniczna, retencja 24 h)
```

Dziewięć tabel w schemacie `public`, zgodnie z [ADR-0003 D1](../adr/ADR-0003-model-danych-migracje-rls.md). Żadnych widoków — potwierdzone w bramce E7 (`public` nie zawiera widoków, więc klasyczne obejście RLS widokiem należącym do `postgres` nie istnieje).

---

## 2. Rozszerzenia i funkcje pomocnicze

Migracja `20261009120100_extensions_and_helpers.sql`:

```sql
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- slug, e-mail bez rozróżniania wielkości
create extension if not exists unaccent;   -- wyszukiwanie bez polskich znaków
create extension if not exists pg_trgm;    -- dopasowania częściowe i literówki

-- unaccent() jest STABLE, a kolumna generowana wymaga IMMUTABLE.
-- Wrapper z jawnym słownikiem jest udokumentowanym wzorcem obejścia.
create or replace function public.immutable_unaccent(txt text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, pg_catalog
as $$ select public.unaccent('public.unaccent'::regdictionary, txt) $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;
```

> **Uwaga operacyjna (dwie, obie istotne):**
>
> 1. Zmiana słownika `unaccent` wymaga przebudowania kolumny `search_tsv` i indeksu GIN.
> 2. `citext`, `pg_trgm` i `unaccent` są zainstalowane **w schemacie `public`** (w odróżnieniu od `pgcrypto`, które Supabase trzyma w `extensions`). Dlatego **nie wolno** użyć zbiorczego `revoke execute on all functions in schema public` — odebrałoby to roli `anon` porównania `slug` i wyszukiwanie trigramowe. Odbieranie uprawnień do funkcji musi być celowane (patrz §4.2).

---

## 3. Tabele

### 3.1 `admin_users`

Uprawnienie administratora wyrażone danymi, nie claimem w JWT ([ADR-0003 D6](../adr/ADR-0003-model-danych-migracje-rls.md)). Migracja `…120200`.

```sql
create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  label      text,                               -- opis konta, bez danych osobowych
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.admin_users a where a.user_id = auth.uid()) $$;
```

Tabela nie ma `updated_at` ani triggera `set_updated_at` — wiersze są dodawane raz, przy ustanawianiu konta.

### 3.2 `categories`

Migracja `…120300`.

```sql
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         citext not null unique,
  name         text   not null,
  description  text,
  icon         text,                              -- nazwa ikony z design systemu
  sort_order   integer not null default 100,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
```

Wartości startowe w seedzie demonstracyjnym: `ai`, `esg`, `jezyk-angielski`, `rozwoj-oprogramowania`, `projekty-br` — wszystkie z prefiksem `[DEMO]` w nazwie.

### 3.3 `trainers`

Migracja `…120300`.

```sql
create table public.trainers (
  id           uuid primary key default gen_random_uuid(),
  slug         citext not null unique,
  full_name    text   not null,
  headline     text,
  bio          text,
  competences  text[] not null default '{}',
  photo_url    text,                              -- NULL do czasu praw do wizerunku
  is_published boolean not null default false,
  published_at timestamptz,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint trainers_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger trainers_set_updated_at before update on public.trainers
  for each row execute function public.set_updated_at();
```

### 3.4 `trainings`

Migracja `…120300` (tabela i indeksy katalogowe), `…120400` (kolumna `search_tsv` i indeksy wyszukiwania).

```sql
create table public.trainings (
  id                uuid primary key default gen_random_uuid(),
  slug              citext not null unique,
  title             text   not null,
  summary           text   not null,
  description       text,
  category_id       uuid   not null references public.categories(id) on delete restrict,
  level             text   check (level in ('podstawowy','sredniozaawansowany','zaawansowany')),
  duration_hours    numeric(5,1) check (duration_hours > 0),
  price_net_pln     numeric(10,2) check (price_net_pln >= 0),
  funding_available boolean not null default false,
  funding_note      text,
  program           jsonb  not null default '[]'::jsonb,   -- [{ "title": "...", "items": ["..."] }]
  learning_outcomes text[] not null default '{}',
  target_audience   text,
  terms_note        text,                                  -- "Najbliższe terminy" jako tekst (ADR-0003 D3)
  is_featured       boolean not null default false,
  is_published      boolean not null default false,
  published_at      timestamptz,
  sort_order        integer not null default 100,
  seo_title         text check (char_length(seo_title) <= 70),
  seo_description   text check (char_length(seo_description) <= 160),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint trainings_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint trainings_program_is_array check (jsonb_typeof(program) = 'array'),
  constraint trainings_published_has_date check (is_published = false or published_at is not null)
);

create index trainings_category_idx  on public.trainings (category_id) where is_published;
create index trainings_published_idx on public.trainings (is_published, sort_order);

create trigger trainings_set_updated_at before update on public.trainings
  for each row execute function public.set_updated_at();
```

Kolumna generowana i indeksy wyszukiwania — **osobna migracja** `…120400`:

```sql
alter table public.trainings
  add column search_tsv tsvector generated always as (
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(summary, ''))), 'B') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(description, ''))), 'C') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(target_audience, ''))), 'C')
  ) stored;

create index trainings_search_idx     on public.trainings using gin (search_tsv);
create index trainings_title_trgm_idx on public.trainings using gin (title gin_trgm_ops);
```

> **Odstępstwo wobec pierwotnej specyfikacji:** dokument wejściowy pokazywał `search_tsv` i oba indeksy jako część definicji tabeli. Implementacja rozbiła to na dwie migracje (`…120300` + `…120400`) zgodnie z regułą „jeden logiczny krok na plik” z [ADR-0003 D9](../adr/ADR-0003-model-danych-migracje-rls.md). Semantyka jest identyczna.

> **Kontrakt normalizacji zapytania — czytaj przed zmianą czegokolwiek w wyszukiwaniu.** `search_tsv` jest zbudowana na tekście **po `unaccent`**, więc fraza wejściowa musi przejść tę samą normalizację. Wykonuje ją **warstwa aplikacji**: `unaccentPl()` w `lib/catalog.ts` odwzorowuje `public.immutable_unaccent()` po stronie Node, a `lib/public-catalog.ts` woła `.textSearch("search_tsv", unaccentPl(q), { config: "simple", type: "websearch" })`. Bez tej normalizacji zapytanie `zrównoważony` daje **zero trafień**, a `zrownowazony` jedno — zmierzone w bramce E2R (ustalenie C2). Konsekwencja: **zmiana słownika `unaccent` wymaga zmiany `unaccentPl()`**, inaczej obie strony rozjadą się po cichu.

> **Znana asymetria (E2R C7):** ograniczenie `trainings_published_has_date` istnieje tylko dla `trainings`; `categories` i `trainers` go nie mają. Panel musi więc pamiętać o `published_at` dla szkoleń, a dla pozostałych dwóch może zostawić `NULL`. `published_at` jest zarządzane przez aplikację, nie przez trigger. Pozycja otwarta zarówno w migracji, jak i w tym dokumencie.

### 3.5 `training_trainers`

Migracja `…120300`.

```sql
create table public.training_trainers (
  training_id uuid not null references public.trainings(id) on delete cascade,
  trainer_id  uuid not null references public.trainers(id)  on delete cascade,
  sort_order  integer not null default 100,
  primary key (training_id, trainer_id)
);

create index training_trainers_trainer_idx on public.training_trainers (trainer_id);
```

### 3.6 `inquiries`

Jedyna tabela z danymi osobowymi. Zasada minimalizacji: brak IP, brak User-Agenta, brak ciasteczek analitycznych — potwierdzone w bramkach E7 i E8 (w całym schemacie nie ma kolumny na IP ani UA). Migracja `…120500`.

```sql
create table public.inquiries (
  id                     uuid primary key default gen_random_uuid(),
  kind                   text   not null check (kind in ('osoba','firma')),
  full_name              text   not null check (char_length(btrim(full_name)) between 2 and 120),
  email                  citext not null check (char_length(email) <= 254),
  phone                  text   not null check (char_length(btrim(phone)) between 6 and 20),
  company_name           text   check (char_length(company_name) <= 160),
  training_id            uuid   references public.trainings(id) on delete set null,
  interest_area          text   check (char_length(interest_area) <= 160),
  message                text   not null check (char_length(btrim(message)) between 10 and 2000),
  rodo_ack               boolean not null check (rodo_ack is true),
  rodo_clause_version    text   not null,          -- wersja klauzuli pokazanej użytkownikowi
  status                 text   not null default 'nowe' check (status in ('nowe','w_toku','zamkniete')),
  admin_note             text   check (char_length(admin_note) <= 2000),
  source_path            text   check (char_length(source_path) <= 200),
  notification_status    text   not null default 'pending'
                           check (notification_status in ('pending','sent','failed')),
  notification_sent_at   timestamptz,
  notification_error     text,                     -- kod/komunikat techniczny, bez danych osobowych
  first_handled_at       timestamptz,
  closed_at              timestamptz,
  retention_delete_after date not null default ((now() + interval '12 months')::date),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint inquiries_company_requires_name
    check (kind <> 'firma' or char_length(btrim(coalesce(company_name, ''))) > 0),
  constraint inquiries_has_subject
    check (training_id is not null or char_length(btrim(coalesce(interest_area, ''))) > 0)
);

create index inquiries_status_idx    on public.inquiries (status, created_at desc);
create index inquiries_retention_idx on public.inquiries (retention_delete_after);
create index inquiries_training_idx  on public.inquiries (training_id);
```

**Kolumny, które nie są dziś używane albo nie są używane tak, jak sugeruje nazwa:**

| Kolumna               | Stan faktyczny                                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_path`         | **zawsze `NULL`.** Pole zarezerwowane (ścieżka strony źródłowej formularza); warstwa API go nie zapisuje. Świadomie zachowane dla przyszłej atrybucji źródła, bez danych osobowych (E8 T11).                                                                                            |
| `rodo_clause_version` | zapisywana przy każdym zgłoszeniu, ale wartość przychodzi **w ciele żądania POST** i nie jest weryfikowana przez serwer. Pole ma dowodzić, _którą_ klauzulę zobaczyła osoba, więc w tej formie jest podmienialne przez składającego żądanie — ustalenie otwarte z bramki RODO (E8 §1a). |
| `notification_error`  | przyjmuje wyłącznie kod techniczny, nigdy komunikatu wyjątku (`safeErrorCode()` w `lib/security/safe-log.ts`) — potwierdzone w E8.                                                                                                                                                      |

**Trigger ograniczający pola edytowalne przez administratora** ([ADR-0003 D7](../adr/ADR-0003-model-danych-migracje-rls.md)):

```sql
create or replace function public.enforce_inquiry_admin_update()
returns trigger
language plpgsql
security definer                     -- patrz nota o odstępstwie poniżej
set search_path = public, pg_temp
as $$
begin
  if (new.kind, new.full_name, new.email, new.phone, new.company_name,
      new.training_id, new.interest_area, new.message, new.rodo_ack,
      new.rodo_clause_version, new.created_at)
     is distinct from
     (old.kind, old.full_name, old.email, old.phone, old.company_name,
      old.training_id, old.interest_area, old.message, old.rodo_ack,
      old.rodo_clause_version, old.created_at) then
    raise exception 'Treść zgłoszenia jest niezmienna; dozwolona jest tylko zmiana statusu i notatki.'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not (old.status, new.status) in
       (('nowe','w_toku'), ('nowe','zamkniete'), ('w_toku','zamkniete'), ('zamkniete','w_toku')) then
      raise exception 'Niedozwolone przejście statusu: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if new.status = 'w_toku' and new.first_handled_at is null then
      new.first_handled_at := now();
    end if;
    new.closed_at := case when new.status = 'zamkniete' then now() else null end;

    insert into public.inquiry_status_history (inquiry_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger inquiries_enforce_admin_update before update on public.inquiries
  for each row execute function public.enforce_inquiry_admin_update();
```

> **Odstępstwo zaakceptowane w bramce E2R: `SECURITY DEFINER`.** Trigger wstawia wiersz do `inquiry_status_history`, która ma RLS i **nie ma** `INSERT` dla roli `authenticated` (macierz §4: „wpis przez trigger"). Bez `DEFINER` legalna zmiana statusu przez administratora byłaby odrzucana. `set search_path = public, pg_temp` (z `pg_temp` na końcu) to idiom wprost z dokumentacji PostgreSQL. `auth.uid()` działa niezależnie od trybu bezpieczeństwa, bo czyta GUC sesji.

> **Ustalenie otwarte (E2R B2, powtórzone jako E7 N4): trigger to czarna lista, a ADR-0003 D7 obiecuje białą.** Trigger pilnuje 11 kolumn osobowych; **wszystko poza nimi jest otwarte**. Zmierzone w sesji administratora: `retention_delete_after`, `notification_status`, `notification_error`, `source_path` i nawet `id` dają się zmienić. `retention_delete_after` **jest** mechanizmem retencji 12 miesięcy, więc administrator może przesunąć go bezterminowo, bez wpisu w `inquiry_status_history` i bez wpisu w `admin_audit_log`. Czarna lista dodatkowo **zawodzi otwarciem** dla każdej kolumny dodanej w przyszłej migracji. Rekomendowana poprawka — uprawnienia kolumnowe, nie dłuższa lista w triggerze:
>
> ```sql
> revoke update on public.inquiries from authenticated;
> grant  update (status, admin_note) on public.inquiries to authenticated;
> ```
>
> Uprawnienia kolumnowe sprawdzają kolumny z `SET`, a nie te ustawiane przez trigger, więc `first_handled_at`, `closed_at` i `updated_at` dalej działają; trigger zostaje jako obrona w głąb. **Poprawka nie została wprowadzona.**

### 3.7 `inquiry_status_history`

Migracja `…120500` (tworzona **przed** triggerem, który do niej pisze).

```sql
create table public.inquiry_status_history (
  id          bigint generated always as identity primary key,
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  from_status text not null,
  to_status   text not null,
  changed_by  uuid references auth.users(id) on delete set null,
  note        text,
  changed_at  timestamptz not null default now()
);

create index inquiry_status_history_inquiry_idx on public.inquiry_status_history (inquiry_id, changed_at desc);
```

`on delete cascade` sprawia, że tabela jest objęta retencją zgłoszeń — zweryfikowane w bramce E8 w treści migracji, nie tylko zadeklarowane.

> **Stan faktyczny:** kolumna `note` **nigdy nie jest zapisywana** (E2R C6). Albo usunąć, albo wykorzystać na zmiany `admin_note`. Pozycja otwarta.

### 3.8 `admin_audit_log`

Migracja `…120600` (tabela i indeks), `…120800` (retencja i ograniczenie na dane osobowe).

```sql
create table public.admin_audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,          -- 'inquiry.suspected_spam', 'training.publish', ...
  entity     text not null,
  entity_id  uuid,                   -- UWAGA: bez klucza obcego do inquiries
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

-- migracja ...120800: zakaz danych osobowych przeniesiony z komentarza SQL do EGZEKWOWALNEGO ograniczenia
alter table public.admin_audit_log
  add constraint admin_audit_log_details_no_pii
  check (not (details ?| array['email','phone','full_name','company_name','message','interest_area']));
```

**Kto faktycznie pisze do tej tabeli.** Bramka E2R rozstrzygnęła, że audyt powinien należeć do bazy (triggery `AFTER INSERT/UPDATE/DELETE` z `SECURITY DEFINER` na tabelach katalogu), żeby dziennika nie dało się pominąć, a panel został przy sesji użytkownika. **Triggery audytu nie istnieją.** Jedyny wpis powstaje w `lib/inquiries/repository.ts` (`recordSuspectedSpam`, akcja `inquiry.suspected_spam`), kluczem `service_role` z Route Handlera. **Operacje administracyjne — publikacja, wycofanie, usunięcie, zmiana statusu — nie są audytowane.** Pozycja otwarta.

Retencja: `purge_expired_audit_log()` w §3.10. Okres docelowy jest decyzją ISKT (E8, pozycja I9).

### 3.9 `form_submission_throttle`

Techniczne liczniki antyspamowe. Identyfikator klienta to HMAC-SHA256 adresu IP z solą serwerową — adres w postaci jawnej nie jest przechowywany i licznik nie jest łączony ze zgłoszeniem. Migracja `…120600`.

```sql
create table public.form_submission_throttle (
  id          bigint generated always as identity primary key,
  client_hash text not null,         -- HMAC-SHA256(ip, FORM_THROTTLE_SALT)
  outcome     text not null check (outcome in ('accepted','rejected')),
  created_at  timestamptz not null default now()
);

create index form_submission_throttle_lookup_idx on public.form_submission_throttle (client_hash, created_at desc);
```

> **Kwalifikacja prawna z bramki RODO (E8 §5), istotna dla klauzuli:** `client_hash` to **pseudonimizacja** (art. 4 pkt 5 RODO), **nie anonimizacja** (motyw 26). Przestrzeń adresów IPv4 jest w pełni przeliczalna, a sól żyje w środowisku tej samej aplikacji, która ma dostęp do bazy — więc ten sam podmiot posiada jednocześnie hasz i klucz. `client_hash` **pozostaje danymi osobowymi** i wlicza się do zakresu klauzuli oraz retencji. Zdanie „nie zapisujemy IP" jest prawdziwe; zdanie „nie da się zidentyfikować" byłoby nieprawdziwe.
>
> Dwa ustalenia otwarte: brak rotacji `FORM_THROTTLE_SALT` (rekomendacja bramki: rotacja dobowa — koszt praktycznie zerowy, bo jedynym skutkiem jest zerowanie liczników w oknach 10 min / 24 h) oraz retencja 24 h, która jest udokumentowana, ale **nie egzekwowana** (funkcja wywoływana wyłącznie ręcznie, pozycja I10).

### 3.10 Funkcje utrzymaniowe

Wszystkie są `SECURITY DEFINER` z ustalonym `search_path` i **wyłącznie** dla roli `service_role` (patrz §4.2 — to nie wynika z samego braku grantu).

```sql
-- migracja ...120500 — retencja zgłoszeń, uruchamiana ręcznie w MVP (ADR-0003 D8)
create or replace function public.purge_expired_inquiries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removed integer;
begin
  delete from public.inquiries
   where retention_delete_after < current_date;
  get diagnostics removed = row_count;      -- faktyczna liczba usuniętych wierszy
  return coalesce(removed, 0);
end $$;

-- migracja ...120600 — czyszczenie liczników antyspamowych starszych niż 24 h
create or replace function public.purge_submission_throttle()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$ delete from public.form_submission_throttle where created_at < now() - interval '24 hours' $$;

-- migracja ...120800 — retencja dziennika audytu (ISK-356 T7; E8 I9)
create or replace function public.purge_expired_audit_log(older_than interval default interval '24 months')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removed integer;
begin
  delete from public.admin_audit_log
   where created_at < now() - older_than;
  get diagnostics removed = row_count;
  return coalesce(removed, 0);
end $$;
```

> **Odstępstwo wobec pierwotnej specyfikacji:** dokument wejściowy pokazywał `purge_expired_inquiries()` ze szkicem `returning 1 into removed` i adnotacją „pełna implementacja zwraca liczbę usuniętych wierszy". Implementacja używa `GET DIAGNOSTICS` i rzeczywiście zwraca tę liczbę.
>
> **Dopisane ponad specyfikację:** `purge_expired_audit_log(interval)` — `admin_audit_log` nie miał żadnej retencji, a `entity_id` nie ma klucza obcego do `inquiries`, więc `purge_expired_inquiries()` tych wierszy nie dotyka (E8 §3b, E7 N3). Wartość domyślna 24 miesiące jest techniczna i konserwatywna; **okres docelowy to decyzja ISKT** (pozycja I9).

> **Ważne dla zgodności: te funkcje są możliwością, nie egzekwowaniem.** `pg_cron` nie jest włączony ([ADR-0003 D8](../adr/ADR-0003-model-danych-migracje-rls.md)), więc dziś **nie istnieje nic, co faktycznie usunie dane po terminie** — ani harmonogram, ani przypisany właściciel, ani termin. Przed publikacją musi istnieć jedno z dwojga: włączony harmonogram albo procedura z imiennie wskazanym właścicielem, cyklem i rejestrem wykonań (E8 §3a, pozycja I6). Dodatkowo dwie kopie danych są całkowicie poza zasięgiem tych funkcji: skrzynka odbiorcy powiadomień i panel/logi Resend (E8 §3c, pozycje I7–I8).

---

## 4. Macierz dostępu

Wszystkie tabele mają `enable row level security`. Migracja `…120700` odbiera rolom klienckim wszystkie uprawnienia (`revoke all on all tables / sequences in schema public from anon, authenticated`), a następnie nadaje minimalne `grant`-y.

### 4.1 Tabele

| Tabela                     | `anon`                                           | `authenticated` bez admina  | administrator (`is_admin()`) | `service_role` (serwer)          |
| -------------------------- | ------------------------------------------------ | --------------------------- | ---------------------------- | -------------------------------- |
| `categories`               | `SELECT` gdy `is_published`                      | `SELECT` gdy `is_published` | `ALL`                        | pełny (omija RLS)                |
| `trainers`                 | `SELECT` gdy `is_published`                      | `SELECT` gdy `is_published` | `ALL`                        | pełny                            |
| `trainings`                | `SELECT` gdy `is_published`                      | `SELECT` gdy `is_published` | `ALL`                        | pełny                            |
| `training_trainers`        | `SELECT` gdy szkolenie **i** trener opublikowane | jak `anon`                  | `ALL`                        | pełny                            |
| `inquiries`                | **brak polityk — odmowa**                        | **brak polityk — odmowa**   | `SELECT`, `UPDATE`           | pełny; wyłączna ścieżka `INSERT` |
| `inquiry_status_history`   | odmowa                                           | odmowa                      | `SELECT`                     | pełny; wpis przez trigger        |
| `admin_audit_log`          | odmowa                                           | odmowa                      | `SELECT`                     | pełny                            |
| `form_submission_throttle` | odmowa                                           | odmowa                      | odmowa                       | pełny                            |
| `admin_users`              | odmowa                                           | odmowa                      | `SELECT`                     | pełny; wiersz dodaje ISKT        |

**Zweryfikowane, nie zadeklarowane.** Bramka architektury (E2R) zmierzyła tę macierz na działającej bazie dla wszystkich 9 tabel i potwierdziła pełną zgodność ze specyfikacją: `anon` ma wyłącznie `SELECT` na czterech tabelach katalogu i zero uprawnień na pozostałych pięciu. Bramka E7 powtórzyła pomiar sondami HTTP kluczem publicznym — `401` / `42501 permission denied` na wszystkich pięciu tabelach ograniczonych, w obu kierunkach, również przy jawnym `?is_published=eq.false`. `INSERT` do `inquiries` kluczem `anon`: `401`.

> **Zawężenie `UPDATE` na `inquiries` jest dziś szersze, niż mówi ta tabela.** `grant select, update on public.inquiries to authenticated` jest kolumnowo pełne, a zawężenie realizuje wyłącznie trigger (czarna lista) — szczegóły i poprawka w §3.6.

Polityki (migracja `…120700`), komplet dla wszystkich tabel z politykami:

```sql
-- categories / trainers / trainings — ten sam wzorzec
create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_published = true);
create policy categories_admin_all on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- (analogicznie trainers_public_read / trainers_admin_all, trainings_public_read / trainings_admin_all)

-- training_trainers: publiczny odczyt tylko gdy OBIE strony opublikowane
create policy training_trainers_public_read on public.training_trainers
  for select to anon, authenticated
  using (
    exists (select 1 from public.trainings t where t.id = training_id and t.is_published)
    and
    exists (select 1 from public.trainers r where r.id = trainer_id  and r.is_published)
  );
create policy training_trainers_admin_all on public.training_trainers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- inquiries: celowo BRAK polityk dla anon; tylko administrator (odczyt + aktualizacja)
create policy inquiries_admin_read on public.inquiries
  for select to authenticated using (public.is_admin());
create policy inquiries_admin_update on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- tylko odczyt dla administratora; zapis odpowiednio: trigger / service_role / ISKT
create policy inquiry_status_history_admin_read on public.inquiry_status_history
  for select to authenticated using (public.is_admin());
create policy admin_audit_log_admin_read on public.admin_audit_log
  for select to authenticated using (public.is_admin());
create policy admin_users_admin_read on public.admin_users
  for select to authenticated using (public.is_admin());

-- form_submission_throttle: brak jakichkolwiek polityk => pełna odmowa dla anon/authenticated
```

> **Znane, nieoptymalne:** predykat `public.is_admin()` nie jest owinięty w `(select …)`, więc jest liczony per wiersz zamiast raz na zapytanie (`InitPlan`). Przy skali katalogu MVP pomijalne, ale lista zgłoszeń w panelu rośnie bez ograniczenia, a poprawka jest darmowa (E2R C4).

### 4.2 Funkcje — macierz, której pierwotna specyfikacja nie zawierała

**To jest sekcja dopisana po defekcie krytycznym.** PostgreSQL nadaje **każdej nowej funkcji** domyślny `EXECUTE TO PUBLIC`, a `revoke all on all tables / sequences` funkcji **nie obejmuje**. Migracja `…120700` tylko dodawała granty i nigdy nie odbierała domyślnego, więc funkcje `purge_*` — `SECURITY DEFINER`, własność `postgres`, nietriggerowe, w schemacie `public` publikowanym przez PostgREST — były wywoływalne **samym kluczem publicznym** jako `POST /rest/v1/rpc/purge_*`. Zmierzone niezależnie w trzech bramkach (E2R B1, E8 §6a, E7 K1). Naprawa: migracja `20261009120800_function_execute_grants.sql` (ISK-356).

| Funkcja                             | `PUBLIC` / `anon` | `authenticated` | `service_role` | Dlaczego                                                                                                                                                                                         |
| ----------------------------------- | ----------------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `immutable_unaccent(text)`          | odebrane          | **`EXECUTE`**   | `EXECUTE`      | kolumna generowana `search_tsv` jest liczona przy **zapisie** `trainings` w sesji administratora; odczyt katalogu przez `anon` czyta gotową, zmaterializowaną kolumnę i tej funkcji nie wywołuje |
| `is_admin()`                        | odebrane          | **`EXECUTE`**   | `EXECUTE`      | ewaluowana w predykatach polityk RLS roli `authenticated`                                                                                                                                        |
| `set_updated_at()`                  | odebrane          | odebrane        | —              | funkcja **triggerowa**: wykonuje się w kontekście triggera niezależnie od grantu i nie jest wystawiana przez PostgREST                                                                           |
| `enforce_inquiry_admin_update()`    | odebrane          | odebrane        | —              | jak wyżej                                                                                                                                                                                        |
| `purge_expired_inquiries()`         | odebrane          | odebrane        | **`EXECUTE`**  | jedyna ścieżka retencji — wyłącznie warstwa serwerowa                                                                                                                                            |
| `purge_submission_throttle()`       | odebrane          | odebrane        | **`EXECUTE`**  | jak wyżej                                                                                                                                                                                        |
| `purge_expired_audit_log(interval)` | odebrane          | odebrane        | **`EXECUTE`**  | jak wyżej                                                                                                                                                                                        |

Funkcje rozszerzeń (`pgcrypto`, `citext`, `unaccent`, `pg_trgm`) są celowo pomijane — zarządza nimi Supabase, a zbiorcze odebranie `EXECUTE` w schemacie `public` zepsułoby publiczny odczyt katalogu (§2, uwaga 2).

**Reguła wiążąca na przyszłość (zmiana zakresu [ADR-0003 D10](../adr/ADR-0003-model-danych-migracje-rls.md)):** „domyślna odmowa" obejmuje **tabele, polityki i funkcje** oraz wszystko, co schemat wystawiony przez PostgREST publikuje jako endpoint. Każda nowa funkcja w `public` wymaga jawnego `revoke execute … from public, anon, authenticated` w tej samej migracji, która ją tworzy.

### 4.3 Znane ograniczenie: domyślna odmowa jest zdarzeniem, nie niezmiennikiem

Ustalenie E2R C3, **nadal otwarte**. Nowa tabela utworzona przez rolę `postgres` dostaje `relrowsecurity = false` oraz — zmierzone w `pg_default_acl` — `MAINTAIN, REFERENCES, TRIGGER, TRUNCATE` dla `anon`/`authenticated`. **RLS nie obejmuje `TRUNCATE`**: E2R zademonstrowała `anon` czyszczącego tabelę z włączonym RLS i bez polityk.

Uczciwa kwalifikacja: przez PostgREST dziś **nieosiągalne** (REST nie wystawia `TRUNCATE`), więc to naruszenie zasady najmniejszych uprawnień, nie żywa dziura zdalna. Połowę problemu („RLS wyłączony") łapie kontrola negatywna N10. Poprawka to jedna linia:

```sql
alter default privileges in schema public revoke all on tables from anon, authenticated;
```

Dodatkowo komentarz w `…120700_rls_policies.sql` twierdzący, że domyślne uprawnienia roli `postgres` **nie** nadają DML rolom klienckim, jest **nieprawdziwy** — nadają `Dxtm`. Komentarz jest nośnym zdaniem w uzasadnieniu tej migracji i warto go poprawić razem z poprawką.

---

## 5. Wymagane testy — mapowanie na faktyczne pliki

Lista obowiązkowa z [ADR-0005 D7](../adr/ADR-0005-ci-i-strategia-testow.md): każdy przypadek poniżej **musi** mieć test. Stan 2026-10-10: **brak luk** — potwierdzone w bramkach E2R i E6.

### Pozytywne

| #   | Przypadek                                                                                  | Plik                                                                                                     |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| P1  | `anon` widzi opublikowane szkolenie, kategorię i trenera                                   | `tests/integration/catalog-rls.test.ts`                                                                  |
| P2  | `anon` widzi powiązanie `training_trainers`, gdy obie strony są opublikowane               | `tests/integration/catalog-rls.test.ts`                                                                  |
| P3  | Administrator widzi szkice i zgłoszenia                                                    | `tests/integration/catalog-rls.test.ts` (szkice), `tests/integration/inquiries-rls.test.ts` (zgłoszenia) |
| P4  | Administrator zmienia status `nowe → w_toku → zamkniete`; wpisy w `inquiry_status_history` | `tests/integration/inquiry-triggers.test.ts`                                                             |
| P5  | `supabase db reset` odtwarza schemat od zera i wykonuje seed bez błędów                    | `tests/integration/schema.test.ts` (obecność seedu oraz obecność wymaganych funkcji)                     |
| P6a | Wyszukiwanie znajduje szkolenie po słowie bez polskich znaków                              | `tests/integration/search.test.ts`                                                                       |
| P6b | Fallback trigramowy znajduje szkolenie po fragmencie tytułu                                | `tests/integration/search.test.ts`                                                                       |

> **Znana luka pokrycia, nie luka listy (E2R C2):** P6a podaje zapytanie **już w ASCII** (`zrownowazony`), czyli kierunek, który nie może zawieść. Kierunek, który zawodzi, to użytkownik piszący po polsku z diakrytykami — i jest to przypadek domyślny. Normalizację wykonuje dziś warstwa aplikacji (`unaccentPl()`, §3.4), ale **żaden test integracyjny nie sprawdza kierunku z diakrytykami**. Do dopisania.

### Negatywne (bramka bezpieczeństwa)

| #   | Przypadek                                                                                       | Plik                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| N1  | `anon` nie widzi szkolenia z `is_published = false` — zero wierszy                              | `tests/integration/catalog-rls.test.ts`                                                                   |
| N2  | `anon` nie widzi `training_trainers`, gdy trener jest szkicem                                   | `tests/integration/catalog-rls.test.ts`                                                                   |
| N3  | `anon` `SELECT` na `inquiries` → zero wierszy / odmowa                                          | `tests/integration/inquiries-rls.test.ts`                                                                 |
| N4  | `anon` `INSERT` do `inquiries` → odmowa                                                         | `tests/integration/inquiries-rls.test.ts`, `tests/integration/inquiries-flow.test.ts`                     |
| N5  | Zalogowany **bez** wiersza w `admin_users` nie widzi zgłoszeń ani szkiców i nie może publikować | `tests/integration/catalog-rls.test.ts` (katalog), `tests/integration/inquiries-rls.test.ts` (zgłoszenia) |
| N6  | Administrator próbujący zmienić `email` lub `message` → wyjątek z triggera                      | `tests/integration/inquiry-triggers.test.ts`                                                              |
| N7  | Niedozwolone przejście statusu (`zamkniete → nowe`) → wyjątek                                   | `tests/integration/inquiry-triggers.test.ts`                                                              |
| N8  | `INSERT` zgłoszenia z `rodo_ack = false` → naruszenie `CHECK`                                   | `tests/integration/inquiry-triggers.test.ts`                                                              |
| N9  | Zgłoszenie `kind = 'firma'` bez `company_name` → naruszenie `CHECK`                             | `tests/integration/inquiry-triggers.test.ts`                                                              |
| N10 | Brak tabeli w schemacie `public` z wyłączonym RLS                                               | `tests/integration/schema.test.ts`                                                                        |

### Dopisane po bramkach — kontrole, których pierwotna lista nie zawierała

| #   | Przypadek                                                                                          | Plik                                        | Dlaczego dopisane                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| T2a | **Żadna funkcja projektu w `public` nie jest wykonywalna przez `anon`** (`has_function_privilege`) | `tests/integration/function-grants.test.ts` | N10 badała wyłącznie `relrowsecurity`, więc defekt P0 z §4.2 był dla niej **niewidoczny**                                |
| T2b | Funkcje utrzymaniowe nie są wykonywalne nawet przez `authenticated`                                | `tests/integration/function-grants.test.ts` | jak wyżej                                                                                                                |
| T2c | Kontrola pozytywna: wymagane funkcje **pozostają** wykonywalne dla właściwych ról                  | `tests/integration/function-grants.test.ts` | zbiorcze `revoke` psuje publiczny odczyt; test pilnuje, żeby poprawka nie przesadziła                                    |
| H1  | Zestaw testów odrzuca hostowany `SUPABASE_URL` / `SUPABASE_DB_URL` **przed pierwszym requestem**   | `tests/integration/hermeticity.test.ts`     | defekt BLK-1 z bramki QA: `npm run test:integration` mógł celować w projekt hostowany i pisać tam kluczem `service_role` |
| H2  | Lokalny stack zawsze wygrywa nad zmiennymi środowiska                                              | `tests/integration/hermeticity.test.ts`     | jak wyżej                                                                                                                |

### Czego kontrola negatywna **nie** sprawdza — do dopisania

- kierunek wyszukiwania z polskimi diakrytykami (P6a powyżej);
- domyślne uprawnienia dla **nowych** tabel (`pg_default_acl`) i `TRUNCATE` — ustalenie §4.3;
- zawężenie kolumnowe `UPDATE` na `inquiries` — dziś nie da się tego przetestować, bo zawężenia nie ma (§3.6).

---

## 6. Otwarte punkty dla ISKT

Pełna, skonsolidowana lista: [`docs/odbior/braki-i-decyzje-iskt.md`](../odbior/braki-i-decyzje-iskt.md). Pozycje dotyczące wyłącznie modelu danych:

1. Czy `trainings.price_net_pln` ma być widoczne publicznie w MVP, czy do czasu zatwierdzenia cen pokazujemy wyłącznie „Zapytaj o cenę". **Stan faktyczny:** katalog i szczegół szkolenia pokazują dziś cenę z seedu demonstracyjnego.
2. Czy w `program` wystarczy struktura modułów (`title` + `items`), czy potrzebny jest dodatkowy poziom.
3. Potwierdzenie listy kategorii startowych (dziś pięć, z prefiksem `[DEMO]`).
4. Potwierdzenie retencji 12 miesięcy **oraz wybór trybu jej wykonywania** — harmonogram albo procedura z imiennym właścicielem i rejestrem wykonań ([ADR-0003 D8](../adr/ADR-0003-model-danych-migracje-rls.md); E8 I6).
5. Okres retencji dla `admin_audit_log` — dziś techniczna wartość domyślna 24 miesiące (E8 I9).
6. Potwierdzenie retencji 24 h dla liczników antyspamowych wraz z trybem wykonywania (E8 I10).
7. Czy **numer telefonu ma pozostać wymagany** — dziś `not null`, przy deklarowanej odpowiedzi e-mailem pole jest nadmiarowe wobec art. 5 ust. 1 lit. c RODO (E8 I11).
8. Ustanowienie konta administratora i dodanie wiersza w `admin_users` — czynność ISKT, nie agenta ([ADR-0003 D6](../adr/ADR-0003-model-danych-migracje-rls.md)).
