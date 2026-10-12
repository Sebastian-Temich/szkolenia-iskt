-- Migracja: panel administratora — domkniecie transakcyjnosci zapisu i dziennika audytu
-- Cel: ustalenia U1 i U2 z recenzji gałęzi ISK-374 (bramka E7C, komentarz 2026-10-12T08:21Z).
--
--   U1: po poprzedniej migracji (20261012141500) `saveTraining()` nadal wykonywalo DWA
--       zapytania: `update/insert trainings` (jedna transakcja) i `set_training_trainers()`
--       (druga). RPC naprawilo atomowosc DELETE+INSERT *wewnatrz* wymiany trenerow, ale para
--       "zapis szkolenia + wymiana przypisan" mogla rozjechac sie w polowie. Scenariusz:
--       administrator zmienia tytul i odznacza trenera, rownolegle ktos usuwa tego trenera,
--       RPC pada na FK — tytul JEST juz zapisany, wpisu w dzienniku NIE MA (powstawal po RPC),
--       a inwalidacja cache sie nie wykonala, wiec publiczne strony pokazuja stary tytul do
--       wygasniecia ISR. Przy tworzeniu bylo gorzej: `insert trainings` commitowal, RPC padal,
--       zostawalo szkolenie bez trenerow i bez sladu w dzienniku, a ponowny zapis uderzal w
--       `unique(slug)` — administrator w zaulku.
--       save_training() obejmuje wszystkie trzy kroki (wiersz `trainings`, wymiana przypisan,
--       wpis w dzienniku) jednym cialem plpgsql, czyli jedna transakcja: albo wszystko, albo nic.
--
--   U2: `deleteCatalogItem()` kasowalo nieodwracalnie, a wpis w dzienniku powstawal PO commicie.
--       Gdy zapis dziennika padl (sieć, chwilowy blad RPC), operacja byla wykonana i nadal nie
--       bylo sladu — czyli dokladnie to, czego zabrania ADR-0003, mimo glosnego bledu.
--       delete_catalog_item() loguje W TEJ SAMEJ transakcji co DELETE: nieudany wpis w dzienniku
--       wycofuje usuniecie, wiec stan "usuniete bez sladu" jest nieosiagalny.
--
-- Zrodlo: ISK-374 (ustalenia U1/U2 recenzenta bramki E7C na ISK-347);
--         docs/adr/ADR-0003-model-danych-migracje-rls.md; docs/architektura/model-danych.md 3.8.
-- Odwracalnosc: forward-only. Obie funkcje sa SECURITY INVOKER — RLS katalogu decyduje nadal
--   o tym, kto moze pisac; funkcje sa granica TRANSAKCJI, nie obejsciem polityk.
--
-- NOTA o EXECUTE: kazda nowa funkcja dziedziczy `EXECUTE TO PUBLIC` i staje sie publicznym RPC
--   PostgREST (defekt ISK-356). Oba obiekty najpierw odbieraja ten grant. Bramka regresyjna:
--   tests/integration/function-grants.test.ts.

-- 1) U1: atomowy zapis szkolenia (wiersz + trenerzy + dziennik) ----------------------
--
-- `p_training` to jsonb, a nie 17 osobnych parametrow, ale zestaw kolumn jest WPISANY NA SZTYWNO
-- ponizej i to on jest granica bezpieczenstwa: payload nie moze ustawic `is_published`,
-- `published_at`, `id` ani znacznikow czasu. Publikacja ma osobna sciezke (setPublished), wiec
-- formularz edycji nie moze opublikowac szkolenia "po drodze".
--
-- `program` (jsonb z sekcjami) celowo NIE jest na liscie — to dlug BL-C opisany w
-- lib/panel/schemas.ts. Pominiecie kolumny w UPDATE zachowuje jej dotychczasowa wartosc, wiec
-- zapis z panelu nie wyczysci programu wprowadzonego seedem.
create or replace function public.save_training(
  p_training_id uuid,
  p_training    jsonb,
  p_trainer_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id        uuid;
  v_is_create boolean := p_training_id is null;
  v_outcomes  text[];
begin
  if p_training is null or jsonb_typeof(p_training) <> 'object' then
    raise exception 'save_training wymaga obiektu jsonb z danymi szkolenia.'
      using errcode = '22023';
  end if;

  -- `learning_outcomes` to text[] not null default '{}' — brak klucza i pusta tablica musza dac
  -- ten sam wynik. array(subquery) zachowuje kolejnosc pozycji z formularza.
  v_outcomes := case
    when jsonb_typeof(p_training->'learning_outcomes') = 'array'
      then array(select jsonb_array_elements_text(p_training->'learning_outcomes'))
    else '{}'::text[]
  end;

  if v_is_create then
    insert into public.trainings (
      slug, title, summary, description, category_id, level,
      duration_hours, price_net_pln, funding_available, funding_note,
      learning_outcomes, target_audience, terms_note, is_featured,
      sort_order, seo_title, seo_description
    )
    values (
      p_training->>'slug',
      p_training->>'title',
      p_training->>'summary',
      p_training->>'description',
      (p_training->>'category_id')::uuid,
      p_training->>'level',
      (p_training->>'duration_hours')::numeric,
      (p_training->>'price_net_pln')::numeric,
      coalesce((p_training->>'funding_available')::boolean, false),
      p_training->>'funding_note',
      v_outcomes,
      p_training->>'target_audience',
      p_training->>'terms_note',
      coalesce((p_training->>'is_featured')::boolean, false),
      coalesce((p_training->>'sort_order')::integer, 100),
      p_training->>'seo_title',
      p_training->>'seo_description'
    )
    returning id into v_id;
  else
    update public.trainings set
      slug              = p_training->>'slug',
      title             = p_training->>'title',
      summary           = p_training->>'summary',
      description       = p_training->>'description',
      category_id       = (p_training->>'category_id')::uuid,
      level             = p_training->>'level',
      duration_hours    = (p_training->>'duration_hours')::numeric,
      price_net_pln     = (p_training->>'price_net_pln')::numeric,
      funding_available = coalesce((p_training->>'funding_available')::boolean, false),
      funding_note      = p_training->>'funding_note',
      learning_outcomes = v_outcomes,
      target_audience   = p_training->>'target_audience',
      terms_note        = p_training->>'terms_note',
      is_featured       = coalesce((p_training->>'is_featured')::boolean, false),
      sort_order        = coalesce((p_training->>'sort_order')::integer, 100),
      seo_title         = p_training->>'seo_title',
      seo_description   = p_training->>'seo_description'
     where id = p_training_id
    returning id into v_id;

    -- RLS filtruje UPDATE jak WHERE: bez polityki zapytanie nie zwraca bledu, tylko zero
    -- wierszy. Bez tego sprawdzenia nie-administrator dostalby cichy sukces.
    if v_id is null then
      raise exception 'Nie znaleziono szkolenia do zapisu albo polityka RLS na to nie pozwala.'
        using errcode = '42501';
    end if;
  end if;

  -- Ta sama funkcja, co przy samodzielnej wymianie trenerow (ISK-374 BL-D) — wywolana w tym
  -- ciele dzieli z nim transakcje, wiec jej blad wycofuje rowniez zapis wiersza `trainings`.
  perform public.set_training_trainers(v_id, p_trainer_ids);

  -- Wpis w dzienniku POWSTAJE W TEJ SAMEJ TRANSAKCJI, co zapis — nie da sie zapisac szkolenia
  -- bez sladu ani zostawic sladu po operacji, ktora sie nie udala (U1).
  perform public.log_admin_action(
    case when v_is_create then 'training.create' else 'training.update' end,
    'training',
    v_id,
    jsonb_build_object('trainers', coalesce(array_length(p_trainer_ids, 1), 0))
  );

  return v_id;
end $$;

comment on function public.save_training(uuid, jsonb, uuid[]) is
  'Atomowy zapis szkolenia: wiersz trainings + wymiana przypisan trenerow + wpis w dzienniku audytu w jednej transakcji (ISK-374 U1). SECURITY INVOKER — RLS nadal obowiazuje. Lista kolumn jest wpisana na sztywno: payload nie moze ustawic is_published/published_at.';

revoke execute on function public.save_training(uuid, jsonb, uuid[]) from public, anon, authenticated;
grant  execute on function public.save_training(uuid, jsonb, uuid[]) to authenticated, service_role;

-- 2) U2: usuniecie i wpis w dzienniku w jednej transakcji ---------------------------
create or replace function public.delete_catalog_item(
  p_kind text,
  p_id   uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_deleted integer;
begin
  -- Rodzaj mapujemy na tabele tutaj, zamiast skladac nazwe dynamicznie — `p_kind` pochodzi
  -- z akcji panelu i nie moze wskazac dowolnej tabeli schematu.
  if p_kind = 'training' then
    delete from public.trainings  where id = p_id;
  elsif p_kind = 'trainer' then
    delete from public.trainers   where id = p_id;
  elsif p_kind = 'category' then
    delete from public.categories where id = p_id;
  else
    raise exception 'Nieznany rodzaj pozycji katalogu: %', p_kind using errcode = '22023';
  end if;

  get diagnostics v_deleted = row_count;

  -- DELETE odfiltrowany przez RLS nie jest bledem — zwraca zero wierszy. Bez tej kontroli
  -- panel zapisalby w dzienniku usuniecie, ktore sie nie odbylo.
  if v_deleted = 0 then
    raise exception 'Nie znaleziono pozycji do usuniecia albo polityka RLS na to nie pozwala.'
      using errcode = '42501';
  end if;

  -- Usuniecie jest NIEODWRACALNE (dla szkolenia kaskaduje na training_trainers), wiec wpis
  -- musi byc czescia tej samej transakcji: nieudany dziennik wycofuje usuniecie (U2).
  perform public.log_admin_action(p_kind || '.delete', p_kind, p_id);
end $$;

comment on function public.delete_catalog_item(text, uuid) is
  'Usuniecie pozycji katalogu razem z wpisem w dzienniku audytu, w jednej transakcji (ISK-374 U2). SECURITY INVOKER — RLS decyduje; zero usunietych wierszy to blad, nie cichy sukces.';

revoke execute on function public.delete_catalog_item(text, uuid) from public, anon, authenticated;
grant  execute on function public.delete_catalog_item(text, uuid) to authenticated, service_role;
