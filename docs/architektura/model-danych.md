# Model danych, RLS i migracje — szkolenia.iskt.pl

- **Status:** projekt do zatwierdzenia (bramka planu ISKT)
- **Data:** 2026-10-09
- **Decyzje:** [ADR-0003](../adr/ADR-0003-model-danych-migracje-rls.md)
- **Implementacja:** Etap 2 — Inżynier Backend / Supabase

Dokument jest specyfikacją wejściową dla migracji. DDL poniżej jest referencyjny: pokazuje intencję, ograniczenia i typy. Finalne pliki migracji powstają w Etapie 2 i mogą różnić się formatowaniem oraz kolejnością, nie semantyką.

---

## 1. Diagram relacji

```
auth.users ──1:1── admin_users
                      │
categories ──1:N── trainings ──N:M── trainers
                      │  (training_trainers)
                      │
                      └──0:N── inquiries ──1:N── inquiry_status_history

admin_audit_log            (niezależna, dziennik operacji)
form_submission_throttle   (niezależna, techniczna, retencja 24 h)
```

---

## 2. Rozszerzenia i funkcje pomocnicze

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

> Uwaga operacyjna: zmiana słownika `unaccent` wymaga przebudowania kolumny `search_tsv` i indeksu GIN.

---

## 3. Tabele

### 3.1 `admin_users`

Uprawnienie administratora wyrażone danymi, nie claimem w JWT (ADR-0003 D6).

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

### 3.2 `categories`

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
```

Wartości startowe (seed demo): `ai`, `esg`, `jezyk-angielski`, `rozwoj-oprogramowania`, `projekty-br`.

### 3.3 `trainers`

```sql
create table public.trainers (
  id           uuid primary key default gen_random_uuid(),
  slug         citext not null unique,
  full_name    text   not null,
  headline     text,                              -- np. "Praktyk z 10+ lat doświadczenia"
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
```

### 3.4 `trainings`

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
  search_tsv        tsvector generated always as (
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(summary, ''))), 'B') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(description, ''))), 'C') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(target_audience, ''))), 'C')
  ) stored,
  constraint trainings_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint trainings_program_is_array check (jsonb_typeof(program) = 'array'),
  constraint trainings_published_has_date check (is_published = false or published_at is not null)
);

create index trainings_search_idx     on public.trainings using gin (search_tsv);
create index trainings_title_trgm_idx on public.trainings using gin (title gin_trgm_ops);
create index trainings_category_idx   on public.trainings (category_id) where is_published;
create index trainings_published_idx  on public.trainings (is_published, sort_order);
```

### 3.5 `training_trainers`

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

Jedyna tabela z danymi osobowymi. Zasada minimalizacji: brak IP, brak User-Agenta, brak ciasteczek analitycznych.

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

**Trigger ograniczający pola edytowalne przez administratora (ADR-0003 D7)**

```sql
create or replace function public.enforce_inquiry_admin_update()
returns trigger
language plpgsql
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
```

### 3.7 `inquiry_status_history`

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

### 3.8 `admin_audit_log`

```sql
create table public.admin_audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,          -- 'training.publish', 'trainer.delete', 'inquiry.status_change', ...
  entity     text not null,
  entity_id  uuid,
  details    jsonb not null default '{}'::jsonb,   -- bez danych osobowych
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
```

### 3.9 `form_submission_throttle`

Techniczne liczniki antyspamowe. Identyfikator klienta to HMAC-SHA256 adresu IP z solą serwerową — nie przechowujemy IP w postaci jawnej i nie łączymy licznika ze zgłoszeniem.

```sql
create table public.form_submission_throttle (
  id          bigint generated always as identity primary key,
  client_hash text not null,         -- HMAC-SHA256(ip, FORM_THROTTLE_SALT)
  outcome     text not null check (outcome in ('accepted','rejected')),
  created_at  timestamptz not null default now()
);

create index form_submission_throttle_lookup_idx on public.form_submission_throttle (client_hash, created_at desc);
```

### 3.10 Funkcje utrzymaniowe

```sql
-- Retencja zgłoszeń: uruchamiana ręcznie w MVP (ADR-0003 D8).
create or replace function public.purge_expired_inquiries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removed integer;
begin
  delete from public.inquiries
   where retention_delete_after < current_date
  returning 1 into removed;        -- pełna implementacja zwraca liczbę usuniętych wierszy
  return coalesce(removed, 0);
end $$;

-- Czyszczenie liczników antyspamowych starszych niż 24 h.
create or replace function public.purge_submission_throttle()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$ delete from public.form_submission_throttle where created_at < now() - interval '24 hours' $$;
```

---

## 4. Macierz dostępu (RLS)

Wszystkie tabele: `alter table … enable row level security`. Następnie `revoke all on all tables in schema public from anon, authenticated` i minimalne `grant`.

| Tabela | `anon` | `authenticated` bez admina | administrator (`is_admin()`) | `service_role` (serwer) |
| --- | --- | --- | --- | --- |
| `categories` | `SELECT` gdy `is_published` | `SELECT` gdy `is_published` | `ALL` | pełny (omija RLS) |
| `trainers` | `SELECT` gdy `is_published` | `SELECT` gdy `is_published` | `ALL` | pełny |
| `trainings` | `SELECT` gdy `is_published` | `SELECT` gdy `is_published` | `ALL` | pełny |
| `training_trainers` | `SELECT` gdy szkolenie **i** trener opublikowane | jak `anon` | `ALL` | pełny |
| `inquiries` | **brak polityk — odmowa** | **brak polityk — odmowa** | `SELECT`, `UPDATE` (pola zawężone triggerem) | pełny; wyłączna ścieżka `INSERT` |
| `inquiry_status_history` | odmowa | odmowa | `SELECT` | pełny; wpis przez trigger |
| `admin_audit_log` | odmowa | odmowa | `SELECT` | pełny |
| `form_submission_throttle` | odmowa | odmowa | odmowa | pełny |
| `admin_users` | odmowa | odmowa | `SELECT` | pełny; wiersz dodaje ISKT |

Przykładowe polityki:

```sql
alter table public.trainings enable row level security;

create policy trainings_public_read on public.trainings
  for select to anon, authenticated
  using (is_published = true);

create policy trainings_admin_all on public.trainings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.training_trainers enable row level security;

create policy training_trainers_public_read on public.training_trainers
  for select to anon, authenticated
  using (
    exists (select 1 from public.trainings t where t.id = training_id and t.is_published)
    and
    exists (select 1 from public.trainers r where r.id = trainer_id  and r.is_published)
  );

-- inquiries: celowo BRAK polityk dla anon/authenticated poza dostępem administratora
alter table public.inquiries enable row level security;

create policy inquiries_admin_read on public.inquiries
  for select to authenticated using (public.is_admin());

create policy inquiries_admin_update on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
```

---

## 5. Wymagane testy (Etap 2, DoD)

### Pozytywne

1. `anon` widzi opublikowane szkolenie, kategorię i trenera.
2. `anon` widzi powiązanie `training_trainers`, gdy obie strony są opublikowane.
3. Administrator widzi szkice i zgłoszenia.
4. Administrator zmienia status `nowe → w_toku → zamkniete`; wpisy pojawiają się w `inquiry_status_history`.
5. `supabase db reset` odtwarza schemat od zera i wykonuje seed bez błędów.
6. Wyszukiwanie znajduje szkolenie po słowie bez polskich znaków (`zrownowazony` ↔ „zrównoważony”) i po fragmencie tytułu.

### Negatywne (bramka bezpieczeństwa)

1. `anon` nie widzi szkolenia z `is_published = false` — zero wierszy.
2. `anon` nie widzi `training_trainers`, gdy trener jest szkicem.
3. `anon` `SELECT` na `inquiries` → zero wierszy / odmowa.
4. `anon` `INSERT` do `inquiries` → odmowa.
5. Zalogowany użytkownik **bez** wiersza w `admin_users` nie widzi zgłoszeń ani szkiców i nie może publikować.
6. Administrator próbujący zmienić `email` lub `message` zgłoszenia → wyjątek z triggera.
7. Niedozwolone przejście statusu (`zamkniete → nowe`) → wyjątek.
8. `INSERT` zgłoszenia z `rodo_ack = false` → naruszenie `CHECK`.
9. Zgłoszenie `kind = 'firma'` bez `company_name` → naruszenie `CHECK`.
10. Zapytanie kontrolne: brak tabeli w schemacie `public` z wyłączonym RLS.

---

## 6. Otwarte punkty dla ISKT

1. Czy `trainings.price_net_pln` ma być widoczne publicznie w MVP, czy do czasu zatwierdzenia cen pokazujemy wyłącznie „Zapytaj o cenę”.
2. Czy w `program` wystarczy struktura modułów (`title` + `items`), czy potrzebny jest dodatkowy poziom.
3. Potwierdzenie listy kategorii startowych.
4. Potwierdzenie retencji i trybu ręcznego usuwania (ADR-0003 D8).
