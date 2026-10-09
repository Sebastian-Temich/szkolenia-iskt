-- Migracja: polityki RLS (domyslna odmowa + minimalny dostep wg macierzy)
-- Cel: wlaczyc Row Level Security na KAZDEJ tabeli public (rowniez bez polityk),
--      odebrac wszystkie uprawnienia rolom anon/authenticated, nastepnie nadac minimalny
--      dostep zgodnie z macierza z model-danych.md sekcja 4. Jeden plik dla czytelnosci
--      przegladu bezpieczenstwa (ADR-0003 D9, D10).
-- Zrodlo: docs/architektura/model-danych.md sekcja 4; ADR-0003 D5, D6, D10.
-- Odwracalnosc: forward-only.
--
-- Kluczowe zasady:
--   * inquiries: BRAK polityk dla anon/authenticated poza dostepem administratora.
--     Zapis (INSERT) wylacznie warstwa serwerowa kluczem service_role (omija RLS).
--   * Administrator rozpoznawany przez public.is_admin() (wiersz w admin_users), nie JWT.
--   * trainings/trainers/categories: publicznie widoczne wylacznie wiersze opublikowane.
--   * Zadna tabela public nie zostaje z wylaczonym RLS.
--   * service_role (serwer) ma atrybut BYPASSRLS i zachowuje uprawnienia domyslne —
--     nie odbieramy ich; jest to wylaczna sciezka zapisu inquiries i throttle.

-- 1) Domyslna odmowa: wlaczenie RLS na wszystkich 9 tabelach ------------------
alter table public.admin_users              enable row level security;
alter table public.categories               enable row level security;
alter table public.trainers                 enable row level security;
alter table public.trainings                enable row level security;
alter table public.training_trainers        enable row level security;
alter table public.inquiries                enable row level security;
alter table public.inquiry_status_history   enable row level security;
alter table public.admin_audit_log          enable row level security;
alter table public.form_submission_throttle enable row level security;

-- 2) Odebranie wszystkich uprawnien rolom klienckim (kasuje domyslne gr-anty) --
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- service_role (serwer) — pelny dostep wg macierzy. Migracje wykonuja sie jako rola
-- postgres, ktorej domyslne uprawnienia NIE nadaja DML rolom anon/authenticated/service_role,
-- dlatego nadajemy je jawnie. service_role ma dodatkowo atrybut BYPASSRLS, ale to nie
-- zastepuje uprawnien tabelarycznych (GRANT) — stad jawny GRANT ALL ponizej.
grant usage on schema public to service_role;
grant all   on all tables    in schema public to service_role;
grant all   on all sequences in schema public to service_role;
-- EXECUTE na wlasnych funkcjach projektu (bez funkcji rozszerzen, by uniknac ostrzezen).
grant execute on function public.immutable_unaccent(text)         to service_role;
grant execute on function public.is_admin()                       to service_role;
grant execute on function public.purge_expired_inquiries()        to service_role;
grant execute on function public.purge_submission_throttle()      to service_role;

-- 3) Minimalne GRANT-y zgodne z macierza -------------------------------------
-- Publiczny odczyt katalogu (wiersze filtruje polityka *_public_read).
grant select on public.categories        to anon, authenticated;
grant select on public.trainers          to anon, authenticated;
grant select on public.trainings         to anon, authenticated;
grant select on public.training_trainers to anon, authenticated;

-- Administrator (authenticated + is_admin()) zarzadza katalogiem.
grant insert, update, delete on public.categories        to authenticated;
grant insert, update, delete on public.trainers          to authenticated;
grant insert, update, delete on public.trainings         to authenticated;
grant insert, update, delete on public.training_trainers to authenticated;

-- Administrator czyta zgloszenia i aktualizuje zawezone pola (trigger pilnuje reszty).
grant select, update on public.inquiries              to authenticated;
-- Administrator czyta historie statusow i dziennik audytu oraz liste adminow.
grant select on public.inquiry_status_history to authenticated;
grant select on public.admin_audit_log        to authenticated;
grant select on public.admin_users            to authenticated;
-- form_submission_throttle: zadnych grantow dla rol klienckich — pelna odmowa.

-- Uprawnienia EXECUTE dla funkcji wykorzystywanych przez role klienckie:
--   * is_admin() — ewaluowana w politykach RLS roli authenticated,
--   * immutable_unaccent() — kolumna generowana search_tsv liczona przy zapisie trainings
--     przez administratora (sesja authenticated).
-- Funkcje utrzymaniowe (purge_*) NIE sa udostepniane rolom klienckim — wylacznie service_role.
grant execute on function public.is_admin()                  to authenticated;
grant execute on function public.immutable_unaccent(text)    to authenticated;

-- 4) Polityki ---------------------------------------------------------------

-- categories
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (is_published = true);
create policy categories_admin_all on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- trainers
create policy trainers_public_read on public.trainers
  for select to anon, authenticated
  using (is_published = true);
create policy trainers_admin_all on public.trainers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- trainings
create policy trainings_public_read on public.trainings
  for select to anon, authenticated
  using (is_published = true);
create policy trainings_admin_all on public.trainings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- training_trainers: publiczny odczyt tylko gdy OBIE strony opublikowane
create policy training_trainers_public_read on public.training_trainers
  for select to anon, authenticated
  using (
    exists (select 1 from public.trainings t where t.id = training_id and t.is_published)
    and
    exists (select 1 from public.trainers r where r.id = trainer_id  and r.is_published)
  );
create policy training_trainers_admin_all on public.training_trainers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- inquiries: celowo BRAK polityk dla anon; tylko administrator (read + update).
create policy inquiries_admin_read on public.inquiries
  for select to authenticated using (public.is_admin());
create policy inquiries_admin_update on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- inquiry_status_history: administrator tylko odczyt; wpis przez trigger (SECURITY DEFINER).
create policy inquiry_status_history_admin_read on public.inquiry_status_history
  for select to authenticated using (public.is_admin());

-- admin_audit_log: administrator tylko odczyt; wpis warstwa serwerowa (service_role).
create policy admin_audit_log_admin_read on public.admin_audit_log
  for select to authenticated using (public.is_admin());

-- admin_users: administrator tylko odczyt; wiersze dodaje ISKT (migracja/Studio).
create policy admin_users_admin_read on public.admin_users
  for select to authenticated using (public.is_admin());

-- form_submission_throttle: brak jakichkolwiek polityk => pelna odmowa dla anon/authenticated.
