-- Migracja: dziennik audytu i liczniki antyspamowe
-- Cel: admin_audit_log — dziennik istotnych operacji administracyjnych (zapisywany
--      warstwa aplikacji kluczem service_role; patrz nota nizej). form_submission_throttle
--      — techniczne liczniki czestosci, identyfikator klienta jako HMAC adresu IP (bez IP
--      jawnego), retencja 24 h przez purge_submission_throttle().
-- Zrodlo: docs/architektura/model-danych.md sekcje 3.8, 3.9, 3.10.
-- Odwracalnosc: forward-only.
--
-- NOTA (do oceny bramki architektury): model-danych.md sekcja 3.8 nie definiuje triggera
--   audytu. Wpisy do admin_audit_log powstaja w warstwie serwerowej (service_role) przy
--   akcjach administracyjnych (np. training.publish). Nie dodaje triggera DB, ktorego
--   zrodlo prawdy nie specyfikuje, aby nie wprowadzac nieokreslonego zachowania. Zakres
--   E2 ("audyt" na liscie triggerow) realizowany jest tu tabela + indeksem + polityka RLS.

-- 3.8 admin_audit_log -------------------------------------------------------
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

-- 3.9 form_submission_throttle ----------------------------------------------
create table public.form_submission_throttle (
  id          bigint generated always as identity primary key,
  client_hash text not null,         -- HMAC-SHA256(ip, FORM_THROTTLE_SALT)
  outcome     text not null check (outcome in ('accepted','rejected')),
  created_at  timestamptz not null default now()
);

create index form_submission_throttle_lookup_idx on public.form_submission_throttle (client_hash, created_at desc);

-- 3.10 Czyszczenie licznikow antyspamowych starszych niz 24 h ---------------
create or replace function public.purge_submission_throttle()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$ delete from public.form_submission_throttle where created_at < now() - interval '24 hours' $$;
