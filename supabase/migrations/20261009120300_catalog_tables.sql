-- Migracja: tabele katalogu (categories, trainers, trainings, training_trainers)
-- Cel: struktura katalogu szkolen z rozdzialem tresci opublikowanych od szkicow
--      (is_published + published_at), relacja N:M szkolenie<->trener, triggery updated_at
--      i indeksy zapytan katalogowych. Kolumna generowana search_tsv i indeksy wyszukiwania
--      sa dodawane w osobnej migracji (catalog_search), zgodnie z ADR-0003 D9.
-- Zrodlo: docs/architektura/model-danych.md sekcje 3.2-3.5; ADR-0003 D1, D2, D3.
-- Odwracalnosc: forward-only.

-- 3.2 categories ------------------------------------------------------------
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

-- 3.3 trainers --------------------------------------------------------------
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

-- 3.4 trainings (bez search_tsv — dodane w catalog_search) -------------------
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
  terms_note        text,                                  -- "Najblizsze terminy" jako tekst (ADR-0003 D3)
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

-- 3.5 training_trainers -----------------------------------------------------
create table public.training_trainers (
  training_id uuid not null references public.trainings(id) on delete cascade,
  trainer_id  uuid not null references public.trainers(id)  on delete cascade,
  sort_order  integer not null default 100,
  primary key (training_id, trainer_id)
);

create index training_trainers_trainer_idx on public.training_trainers (trainer_id);

-- Triggery updated_at -------------------------------------------------------
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger trainers_set_updated_at before update on public.trainers
  for each row execute function public.set_updated_at();
create trigger trainings_set_updated_at before update on public.trainings
  for each row execute function public.set_updated_at();
