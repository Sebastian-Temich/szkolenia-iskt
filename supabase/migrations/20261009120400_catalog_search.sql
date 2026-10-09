-- Migracja: wyszukiwanie w katalogu (search_tsv + indeksy GIN/trigram)
-- Cel: dodac kolumne generowana search_tsv na trainings (tsvector na konfiguracji
--      'simple' nad tekstem przepuszczonym przez immutable_unaccent, z wagami
--      tytul A / streszczenie B / opis i grupa docelowa C) oraz indeksy: GIN do
--      zapytan pelnotekstowych i trigramowy na tytule do dopasowan czesciowych/literowek.
-- Zrodlo: docs/architektura/model-danych.md sekcja 3.4; ADR-0003 D4.
-- Odwracalnosc: forward-only. Zmiana slownika unaccent wymaga przebudowania tej kolumny i indeksu GIN.

alter table public.trainings
  add column search_tsv tsvector generated always as (
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(title, ''))), 'A') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(summary, ''))), 'B') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(description, ''))), 'C') ||
      setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(target_audience, ''))), 'C')
  ) stored;

create index trainings_search_idx     on public.trainings using gin (search_tsv);
create index trainings_title_trgm_idx on public.trainings using gin (title gin_trgm_ops);
