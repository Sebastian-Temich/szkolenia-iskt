-- Migracja: panel administratora — sciezka zapisu dziennika audytu i atomowa wymiana trenerow
-- Cel: dwa ustalenia blokujace bramki code review (ISK-374):
--   BL-A: admin_audit_log istnial od 20261009120600, ale ZADNA operacja panelu nic do niego nie
--         pisala. Panel dziala na sesji administratora (rola `authenticated`), a tabela ma tylko
--         polityke SELECT ("wpis warstwa serwerowa"), wiec INSERT z panelu byl odrzucany przez RLS.
--         Dajemy jedno, kontrolowane wejscie: log_admin_action() SECURITY DEFINER, ktore wymaga
--         is_admin() i WYMUSZA actor_id = auth.uid() (wywolujacy nie moze podstawic obcego autora).
--         Tabela nadal nie ma polityki INSERT — dziennika nie da sie pisac inaczej niz ta funkcja
--         (klient) albo kluczem service_role (warstwa API zgloszen, lib/inquiries/repository.ts).
--   BL-D: saveTraining() wymienial przypisania trenerow jako DELETE + INSERT w dwoch osobnych
--         zapytaniach REST, czyli w dwoch transakcjach. Blad INSERT (np. rownolegle usuniety
--         trener — trainer_id ma FK) zostawial szkolenie BEZ ZADNEGO trenera, a publiczna strona
--         szczegolu tracila sekcje "Prowadzacy". set_training_trainers() robi oba kroki w jednej
--         transakcji (cialo funkcji plpgsql), wiec blad wycofuje rowniez DELETE i zostaje stan
--         poprzedni. Celowo SECURITY INVOKER: RLS (training_trainers_admin_all) dalej decyduje,
--         kto moze zmieniac przypisania — funkcja nie jest obejsciem polityk, tylko granica
--         transakcji.
-- Zrodlo: ISK-374 (werdykt bramki E7C na ISK-347, ustalenia BL-A i BL-D);
--         docs/adr/ADR-0003-model-danych-rls.md; docs/architektura/model-danych.md sekcja 3.8.
-- Odwracalnosc: forward-only.
--
-- NOTA o EXECUTE: PostgreSQL nadaje kazdej nowej funkcji domyslny `EXECUTE TO PUBLIC`, przez co
--   funkcja w schemacie `public` staje sie publicznym RPC PostgREST (defekt ISK-356). Oba ponizsze
--   obiekty najpierw odbieraja ten grant, a potem dostaja minimalny zestaw rol. Bramka regresyjna:
--   tests/integration/function-grants.test.ts.

-- 1) BL-A: dziennik audytu zapisywany z sesji administratora -------------------------
create or replace function public.log_admin_action(
  p_action    text,
  p_entity    text,
  p_entity_id uuid,
  p_details   jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inserted_id bigint;
begin
  -- DEFINER omija RLS, wiec uprawnienie sprawdzamy jawnie i jako pierwsze.
  if not public.is_admin() then
    raise exception 'Brak uprawnien do zapisu w dzienniku audytu.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_action), '') = '' or coalesce(btrim(p_entity), '') = '' then
    raise exception 'Wpis dziennika audytu wymaga action i entity.'
      using errcode = 'check_violation';
  end if;

  -- actor_id pochodzi z sesji, nie z argumentu — autora wpisu nie da sie podstawic.
  -- Zakaz danych osobowych w `details` egzekwuje ograniczenie admin_audit_log_details_no_pii.
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), btrim(p_action), btrim(p_entity), p_entity_id,
          coalesce(p_details, '{}'::jsonb))
  returning id into inserted_id;

  return inserted_id;
end $$;

comment on function public.log_admin_action(text, text, uuid, jsonb) is
  'Jedyne wejscie zapisu do admin_audit_log z sesji administratora (ISK-374 BL-A). Wymaga is_admin(); actor_id wymuszone z auth.uid().';

revoke execute on function public.log_admin_action(text, text, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.log_admin_action(text, text, uuid, jsonb) to authenticated, service_role;

-- 2) BL-D: atomowa wymiana przypisan trenerow --------------------------------------
create or replace function public.set_training_trainers(
  p_training_id uuid,
  p_trainer_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.training_trainers
   where training_id = p_training_id;

  -- Kolejnosc z tablicy wejsciowej (ordinality) zachowuje sort_order ustalany w panelu.
  insert into public.training_trainers (training_id, trainer_id, sort_order)
  select p_training_id, ids.trainer_id, (ids.ord * 10)::integer
    from unnest(coalesce(p_trainer_ids, '{}'::uuid[])) with ordinality as ids(trainer_id, ord);
end $$;

comment on function public.set_training_trainers(uuid, uuid[]) is
  'Atomowa wymiana przypisan trenerow szkolenia (ISK-374 BL-D). SECURITY INVOKER — RLS training_trainers_admin_all nadal obowiazuje.';

revoke execute on function public.set_training_trainers(uuid, uuid[]) from public, anon, authenticated;
grant  execute on function public.set_training_trainers(uuid, uuid[]) to authenticated, service_role;
