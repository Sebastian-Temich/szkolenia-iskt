-- Migracja: zgloszenia (inquiries, inquiry_status_history, triggery, retencja)
-- Cel: jedyna tabela z danymi osobowymi. Minimalizacja danych (brak IP, User-Agenta,
--      ciasteczek). Trigger wymusza niezmiennosc tresci zgloszenia i dozwolone przejscia
--      statusu, zapisuje historie statusow i aktualizuje znaczniki czasu. Funkcja retencji
--      usuwa zgloszenia po 12 miesiacach (uruchamiana recznie w MVP, ADR-0003 D8).
-- Zrodlo: docs/architektura/model-danych.md sekcje 3.6, 3.7, 3.10; ADR-0003 D5, D7, D8.
-- Odwracalnosc: forward-only.
--
-- ODSTEPSTWO wzgledem model-danych.md (do oceny bramki architektury):
--   enforce_inquiry_admin_update() oznaczono SECURITY DEFINER z 'set search_path',
--   zamiast domyslnego SECURITY INVOKER z dokumentu. Powod: trigger wstawia wiersz do
--   inquiry_status_history, ktora ma RLS z domyslna odmowa i bez polityki/GRANT INSERT dla
--   roli 'authenticated' (macierz sekcja 4: "wpis przez trigger"). Bez SECURITY DEFINER
--   zmiana statusu przez administratora bylabyby odrzucana (test pozytywny #4). DEFINER
--   (wlasciciel = postgres) omija RLS tej tabeli, zachowujac intencje macierzy. auth.uid()
--   dziala niezaleznie od trybu bezpieczenstwa (czyta GUC sesji).

-- 3.6 inquiries -------------------------------------------------------------
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
  rodo_clause_version    text   not null,          -- wersja klauzuli pokazanej uzytkownikowi
  status                 text   not null default 'nowe' check (status in ('nowe','w_toku','zamkniete')),
  admin_note             text   check (char_length(admin_note) <= 2000),
  source_path            text   check (char_length(source_path) <= 200),  -- ISK-356 T11: pole zarezerwowane (sciezka strony zrodlowej formularza). Warstwa API (E3) obecnie go nie zapisuje => zawsze NULL; swiadomie zachowane dla przyszlej atrybucji zrodla, bez danych osobowych.
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

-- 3.7 inquiry_status_history (tworzona przed triggerem, ktory do niej pisze) -----
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

-- Trigger: niezmiennosc tresci + dozwolone przejscia statusu + historia (ADR-0003 D7)
create or replace function public.enforce_inquiry_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.kind, new.full_name, new.email, new.phone, new.company_name,
      new.training_id, new.interest_area, new.message, new.rodo_ack,
      new.rodo_clause_version, new.created_at)
     is distinct from
     (old.kind, old.full_name, old.email, old.phone, old.company_name,
      old.training_id, old.interest_area, old.message, old.rodo_ack,
      old.rodo_clause_version, old.created_at) then
    raise exception 'Tresc zgloszenia jest niezmienna; dozwolona jest tylko zmiana statusu i notatki.'
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

create trigger inquiries_enforce_admin_update before update on public.inquiries
  for each row execute function public.enforce_inquiry_admin_update();

-- 3.10 Retencja zgloszen: uruchamiana recznie w MVP (ADR-0003 D8) ------------
-- Implementacja pelna: zwraca faktyczna liczbe usunietych wierszy (GET DIAGNOSTICS).
create or replace function public.purge_expired_inquiries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removed integer;
begin
  delete from public.inquiries
   where retention_delete_after < current_date;
  get diagnostics removed = row_count;
  return coalesce(removed, 0);
end $$;
