-- Seed demonstracyjny — szkolenia.iskt.pl
-- UWAGA: wylacznie dane FIKCYJNE. Kazdy rekord z prefiksem [DEMO] w tytule/nazwie,
-- adresy e-mail w domenie example.invalid. Zero realnych tresci, cen, terminow,
-- nazwisk i danych osobowych (ADR-0002 sekcja 6, zlecenie paragraf 4).
-- Dane sa wczytywane przez `supabase db reset` po migracjach.

-- Kategorie (lista startowa wg model-danych.md sekcja 3.2) --------------------
insert into public.categories (slug, name, description, icon, sort_order, is_published, published_at) values
  ('ai',                     '[DEMO] Sztuczna inteligencja', 'Przykladowy opis kategorii AI.',            'cpu',       10, true, now()),
  ('esg',                    '[DEMO] ESG',                    'Przykladowy opis kategorii ESG.',           'leaf',      20, true, now()),
  ('jezyk-angielski',        '[DEMO] Jezyk angielski',        'Przykladowy opis kategorii jezykowej.',     'languages', 30, true, now()),
  ('rozwoj-oprogramowania',  '[DEMO] Rozwoj oprogramowania',  'Przykladowy opis kategorii IT.',            'code',      40, true, now()),
  ('projekty-br',            '[DEMO] Projekty B+R',           'Przykladowy opis kategorii B+R.',           'flask',     50, true, now());

-- Trenerzy (fikcyjni) --------------------------------------------------------
insert into public.trainers (slug, full_name, headline, bio, competences, photo_url, is_published, published_at, sort_order) values
  ('jan-przykladowy',  '[DEMO] Jan Przykladowy',  'Praktyk (dane demonstracyjne)', 'Fikcyjny biogram trenera na potrzeby srodowiska lokalnego.', array['AI','MLOps'],        null, true, now(), 10),
  ('anna-testowa',     '[DEMO] Anna Testowa',     'Ekspertka (dane demonstracyjne)', 'Fikcyjny biogram trenerki na potrzeby srodowiska lokalnego.', array['ESG','Raportowanie'], null, true, now(), 20);

-- Szkolenia (fikcyjne). Jedno z "zrownowazony" do testu wyszukiwania bez polskich znakow.
insert into public.trainings
  (slug, title, summary, description, category_id, level, duration_hours, price_net_pln,
   funding_available, program, learning_outcomes, target_audience, terms_note,
   is_featured, is_published, published_at, sort_order, seo_title, seo_description)
values
  ('wprowadzenie-do-ai',
   '[DEMO] Wprowadzenie do AI',
   'Przykladowe szkolenie wprowadzajace do sztucznej inteligencji.',
   'Fikcyjny opis szczegolowy szkolenia demonstracyjnego o AI.',
   (select id from public.categories where slug = 'ai'),
   'podstawowy', 16.0, 1990.00, true,
   '[{"title":"Modul 1","items":["Podstawy","Zastosowania"]}]'::jsonb,
   array['Rozumie podstawy AI','Zna typowe zastosowania'],
   'Osoby poczatkujace', 'Najblizsze terminy: dane demonstracyjne.',
   true, true, now(), 10, '[DEMO] Wprowadzenie do AI', 'Przykladowy opis SEO szkolenia o AI.'),

  ('zrownowazony-rozwoj-esg',
   '[DEMO] Zrownowazony rozwoj i ESG w praktyce',
   'Przykladowe szkolenie o zrownowazonym rozwoju i raportowaniu ESG.',
   'Fikcyjny opis szczegolowy szkolenia demonstracyjnego o ESG i zrownowazonym rozwoju.',
   (select id from public.categories where slug = 'esg'),
   'sredniozaawansowany', 24.0, 2990.00, false,
   '[{"title":"Modul 1","items":["Wprowadzenie do ESG","Raportowanie"]}]'::jsonb,
   array['Rozumie zasady ESG','Potrafi przygotowac raport'],
   'Specjalisci ds. zrownowazonego rozwoju', 'Najblizsze terminy: dane demonstracyjne.',
   false, true, now(), 20, '[DEMO] ESG w praktyce', 'Przykladowy opis SEO szkolenia o ESG.'),

  ('angielski-techniczny',
   '[DEMO] Angielski techniczny dla IT',
   'Przykladowe szkolenie z angielskiego technicznego.',
   'Fikcyjny opis szczegolowy szkolenia demonstracyjnego z jezyka angielskiego.',
   (select id from public.categories where slug = 'jezyk-angielski'),
   'sredniozaawansowany', 40.0, 3490.00, false,
   '[{"title":"Modul 1","items":["Slownictwo IT","Komunikacja"]}]'::jsonb,
   array['Swobodnie komunikuje sie w IT po angielsku'],
   'Zespoly IT', 'Najblizsze terminy: dane demonstracyjne.',
   false, true, now(), 30, '[DEMO] Angielski techniczny', 'Przykladowy opis SEO szkolenia jezykowego.');

-- Powiazania szkolenie <-> trener -------------------------------------------
insert into public.training_trainers (training_id, trainer_id, sort_order) values
  ((select id from public.trainings where slug = 'wprowadzenie-do-ai'),      (select id from public.trainers where slug = 'jan-przykladowy'), 10),
  ((select id from public.trainings where slug = 'zrownowazony-rozwoj-esg'), (select id from public.trainers where slug = 'anna-testowa'),    10);
