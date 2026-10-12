-- Migracja: zawezenie UPDATE na inquiries + obrona w glab egzekwowania retencji PII
-- Cel: naprawic defekt bezpieczenstwa ISK-371 (ustalenie N4 z security review ISK-350).
--      Migracja 20261009120700_rls_policies.sql nadawala `grant select, update on
--      public.inquiries to authenticated` — czyli UPDATE na WSZYSTKICH kolumnach. Trigger
--      enforce_inquiry_admin_update() pilnuje niezmiennosci tresci/PII i dozwolonych przejsc
--      statusu, ale NIE chronil kolumny `retention_delete_after`. W efekcie administrator
--      (authenticated + is_admin()) mogl recznie wykonac
--        UPDATE public.inquiries SET retention_delete_after = '2999-12-31'
--      i trwale wylaczyc rekord z retencji (purge_expired_inquiries() kasuje tylko wiersze
--      z retention_delete_after < current_date) — obejscie egzekwowania retencji danych
--      osobowych (art. 5 ust. 1 lit. e oraz art. 25 RODO: ograniczenie przechowywania,
--      privacy by design). Analogicznie mogl przyspieszyc kasowanie, ustawiajac date w
--      przeszlosci. Zadne z tych dzialan nie jest operacja panelu administratora.
-- Zrodlo: ISK-371; security review ISK-350 (N4); docs/architektura/model-danych.md
--         sekcje 3.6, 3.10 i 4 (administrator aktualizuje jedynie status + admin_note).
-- Odwracalnosc: forward-only.
--
-- Zakres zmiany (dwie niezalezne warstwy, obrona w glab):
--   1) GRANT na poziomie kolumn (kontrola podstawowa, PostgREST dziala jako `authenticated`):
--      odbieramy tabelaryczny UPDATE i nadajemy UPDATE wylacznie na (status, admin_note).
--      Kazda proba UPDATE dotykajaca retention_delete_after, dat, pol notyfikacji czy PII
--      jest odrzucana przez PostgreSQL (brak uprawnienia do kolumny) zanim dosiegnie triggera.
--      SELECT pozostaje pelny (panel administratora czyta wszystkie kolumny).
--   2) TRIGGER (obrona w glab na wypadek przyszlego rozszerzenia grantu lub bledu warstwy
--      serwerowej): rozszerzamy liste kolumn niezmiennych w enforce_inquiry_admin_update()
--      o `retention_delete_after`. Dzieki temu nawet sciezka omijajaca grant kolumnowy
--      (np. service_role z GRANT ALL + BYPASSRLS) nie moze zmienic terminu retencji przez
--      UPDATE. Warstwa serwerowa (lib/inquiries/repository.ts) aktualizuje wylacznie pola
--      notification_* i statusu — nigdy retention_delete_after — wiec zmiana jej nie dotyka.
--      Jedyna sankcjonowana zmiana retencji to DELETE przez purge_expired_inquiries()
--      (trigger BEFORE UPDATE nie odpala sie przy DELETE) albo swiadoma, osobna migracja.

-- 1) Kontrola podstawowa: zawezenie UPDATE do kolumn operacyjnych panelu ------------
revoke update on public.inquiries from authenticated;
grant  update (status, admin_note) on public.inquiries to authenticated;

-- 2) Obrona w glab: retention_delete_after niezmienne przez UPDATE (dowolna rola) ----
-- Odtwarzamy funkcje 1:1 z 20261009120500_inquiries.sql, dokladajac retention_delete_after
-- do krotki porownywanej (is distinct from). Pozostale pola (status, admin_note,
-- notification_*, first_handled_at, closed_at, updated_at) pozostaja aktualizowalne zgodnie
-- z macierza i logika workflow statusu.
create or replace function public.enforce_inquiry_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.kind, new.full_name, new.email, new.phone, new.company_name,
      new.training_id, new.interest_area, new.message, new.rodo_ack,
      new.rodo_clause_version, new.created_at, new.retention_delete_after)
     is distinct from
     (old.kind, old.full_name, old.email, old.phone, old.company_name,
      old.training_id, old.interest_area, old.message, old.rodo_ack,
      old.rodo_clause_version, old.created_at, old.retention_delete_after) then
    raise exception 'Tresc zgloszenia i termin retencji sa niezmienne; dozwolona jest tylko zmiana statusu i notatki.'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if not (old.status, new.status) in
       (('nowe','w_toku'), ('nowe','zamkniete'), ('w_toku','zamkniete'), ('zamkniete','w_toku')) then
      raise exception 'Niedozwolone przejscie statusu: % -> %', old.status, new.status
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
