-- Migracja: admin_users i predykat is_admin()
-- Cel: wyrazic uprawnienie administratora danymi (wiersz w admin_users), nie claimem
--      w JWT. Funkcja is_admin() jest podstawa predykatow RLS w migracji polityk.
-- Zrodlo: docs/architektura/model-danych.md sekcja 3.1; ADR-0003 D6.
-- Odwracalnosc: forward-only; wiersze admin_users dodaje ISKT przy ustanawianiu konta.

create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  label      text,                               -- opis konta, bez danych osobowych
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER + staly search_path: funkcja czyta admin_users niezaleznie od RLS
-- i uprawnien wywolujacego, dzieki czemu moze byc uzyta w politykach innych tabel.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.admin_users a where a.user_id = auth.uid()) $$;
