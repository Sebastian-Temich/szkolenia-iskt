-- Migracja: utwardzenie uprawnien EXECUTE na funkcjach projektu + retencja audytu
-- Cel: naprawic defekt bezpieczenstwa ISK-356 (P0). PostgreSQL nadaje KAZDEJ nowej
--      funkcji domyslny grant `EXECUTE TO PUBLIC`. Migracja 20261009120700 nadawala
--      `grant execute ... to service_role`, ale nigdy nie odbierala domyslnego grantu
--      PUBLIC. W efekcie funkcje `SECURITY DEFINER` purge_* (wlasciciel postgres,
--      schemat public eksponowany przez PostgREST, nie-triggerowe) byly publikowane jako
--      POST /rest/v1/rpc/purge_* i wywolywalne samym kluczem anon — co kasowalo liczniki
--      antyspamowe i wymuszalo nieautoryzowana retencje danych osobowych (art. 32 ust. 1
--      lit. b oraz art. 5 ust. 2 RODO).
-- Zrodlo: ISK-356; ISK-346 (E8) sekcja 6a; docs/architektura/model-danych.md sekcje 3.8, 3.10.
-- Odwracalnosc: forward-only.
--
-- Zasada docelowa: ZADNA funkcja projektu w schemacie public nie jest wykonywalna przez
--   PUBLIC/anon/authenticated poza jawnie potrzebnymi. Najpierw odbieramy EXECUTE od
--   PUBLIC (co usuwa domyslny grant i obejmuje anon oraz authenticated), a nastepnie
--   nadajemy minimalny zestaw. Odbieramy tez jawnie od anon/authenticated dla czytelnosci
--   i na wypadek wczesniejszego jawnego grantu. Funkcje rozszerzen (pgcrypto/citext/
--   unaccent/pg_trgm) celowo pomijamy — nimi zarzadza Supabase.

-- 1) Odebranie EXECUTE od ról publicznych na WSZYSTKICH funkcjach projektu ----------
revoke execute on function public.immutable_unaccent(text)        from public, anon, authenticated;
revoke execute on function public.is_admin()                      from public, anon, authenticated;
revoke execute on function public.set_updated_at()                from public, anon, authenticated;
revoke execute on function public.enforce_inquiry_admin_update()  from public, anon, authenticated;
revoke execute on function public.purge_expired_inquiries()       from public, anon, authenticated;
revoke execute on function public.purge_submission_throttle()     from public, anon, authenticated;

-- 2) Minimalny re-grant zgodny z faktycznym uzyciem --------------------------------
--   * is_admin()           — ewaluowana w politykach RLS roli authenticated.
--   * immutable_unaccent() — kolumna generowana (STORED) search_tsv liczona przy zapisie
--     trainings przez administratora (sesja authenticated). Odczyt katalogu przez anon
--     czyta gotowa, zmaterializowana kolumne i NIE wywoluje tej funkcji.
--   * service_role zachowuje EXECUTE na funkcjach utrzymaniowych (jedyna sciezka purge).
--   * set_updated_at(), enforce_inquiry_admin_update() — funkcje TRIGGEROWE; wykonuja sie
--     w kontekscie triggera niezaleznie od grantu EXECUTE, wiec celowo nie nadajemy ich
--     zadnej roli klienckiej (nie sa tez wywolywalne przez PostgREST jako funkcje triggerowe).
grant execute on function public.is_admin()                  to authenticated, service_role;
grant execute on function public.immutable_unaccent(text)    to authenticated, service_role;
grant execute on function public.purge_expired_inquiries()   to service_role;
grant execute on function public.purge_submission_throttle() to service_role;

-- 3) Retencja admin_audit_log (ISK-356 T7; ISK-346 I9) -----------------------------
-- Kontekst: admin_audit_log nie mial zadnej retencji. entity_id NIE ma FK do inquiries,
-- wiec purge_expired_inquiries() tych wierszy nie dotyka. Dziennik moze przechowywac
-- metadane operacji administracyjnych — bez danych osobowych (patrz nota ponizej).
--
-- Mechanizm przygotowujemy teraz; docelowy OKRES retencji to decyzja ISKT (raport E8, I9).
-- Do czasu jej podjecia parametr `older_than` domyslnie 24 miesiace — wartosc techniczna,
-- konserwatywna (dluzsza niz 12 mies. retencji zgloszen), latwa do zmiany jedna migracja.
-- Funkcja jest SECURITY DEFINER i wykonywalna wylacznie przez service_role (jak purge_*).
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

revoke execute on function public.purge_expired_audit_log(interval) from public, anon, authenticated;
grant  execute on function public.purge_expired_audit_log(interval) to service_role;

-- Zakaz danych osobowych w admin_audit_log.details przeniesiony z komentarza SQL
-- (20261009120600:26) do EGZEKWOWALNEGO ograniczenia. Odrzuca wpisy zawierajace na
-- najwyzszym poziomie klucze o oczywistym charakterze danych osobowych. To warstwa
-- defensywna uzupelniajaca dyscypline warstwy aplikacji (service_role), nie jej zamiennik.
alter table public.admin_audit_log
  add constraint admin_audit_log_details_no_pii
  check (not (details ?| array['email','phone','full_name','company_name','message','interest_area']));
