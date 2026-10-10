-- Migracja: rozszerzenia i funkcje pomocnicze
-- Cel: wlaczyc rozszerzenia wymagane przez model danych (UUID, citext, wyszukiwanie
--      bez polskich znakow i dopasowania czesciowe) oraz zdefiniowac funkcje pomocnicze
--      uzywane przez kolejne migracje (immutable_unaccent do kolumny generowanej,
--      set_updated_at do triggerow updated_at).
-- Zrodlo: docs/architektura/model-danych.md sekcja 2; ADR-0003 D4, D9.
-- Odwracalnosc: odwracalna (drop extension / drop function), lecz migracje sa
--      forward-only; cofniecie realizuje sie nowa migracja.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- slug, e-mail bez rozrozniania wielkosci liter
create extension if not exists unaccent;   -- wyszukiwanie bez polskich znakow
create extension if not exists pg_trgm;    -- dopasowania czesciowe i literowki

-- unaccent() jest STABLE, a kolumna generowana wymaga funkcji IMMUTABLE.
-- Wrapper z jawnym slownikiem to udokumentowany wzorzec obejscia (ADR-0003 D4).
-- Konsekwencja: zmiana slownika unaccent wymaga przebudowania search_tsv i indeksu GIN.
create or replace function public.immutable_unaccent(txt text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, pg_catalog
as $$ select public.unaccent('public.unaccent'::regdictionary, txt) $$;

-- Wspolny trigger ustawiajacy updated_at przy kazdym UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;
