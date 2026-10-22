-- Seed demonstracyjny — szkolenia.iskt.pl
-- UWAGA: wylacznie dane FIKCYJNE. Kazdy rekord z prefiksem [DEMO] w tytule/nazwie,
-- adresy e-mail w domenie example.invalid. Zero realnych tresci, cen, terminow,
-- nazwisk i danych osobowych (ADR-0002 sekcja 6, zlecenie paragraf 4).
-- Dane sa wczytywane przez `supabase db reset` po migracjach.
--
-- ISK-412 — TRESC WIDOCZNA MA POLSKIE ZNAKI, IDENTYFIKATORY NIE MAJA.
-- Bramka UX zglosila „Jezyk angielski” i „sredniozaawansowany” na ekranie:
-- zasiew pisal nazwy BEZ diakrytykow, a widok renderuje je wprost, wiec produkt
-- pokazywal ISKT polszczyzne bez ogonkow. Kolumny `name`, `title`, `summary`,
-- `description`, `headline`, `bio`, `learning_outcomes`, `target_audience`,
-- `terms_note`, `program.title/items` i `seo_*` sa TRESCIA i dostaja diakrytyki.
--
-- `slug` ZOSTAJE ASCII swiadomie — jest czescia adresu URL i kluczem, po ktorym
-- chodza testy e2e (`/szkolenia/wprowadzenie-do-ai`) oraz podzapytania ponizej.
-- `level` tez zostaje ASCII: to slownik kontrolowany przez `check` w migracji
-- i `z.enum` w `lib/panel/schemas.ts`, a migracje sa w ISK-412 zabronione —
-- diakrytyki dokleja `formatLevel()` z `lib/format.ts` przy renderze.

-- Kategorie (lista startowa wg model-danych.md sekcja 3.2) --------------------
insert into public.categories (slug, name, description, icon, sort_order, is_published, published_at) values
  ('ai',                     '[DEMO] Sztuczna inteligencja', 'Przykładowy opis kategorii AI.',            'cpu',       10, true, now()),
  ('esg',                    '[DEMO] ESG',                    'Przykładowy opis kategorii ESG.',           'leaf',      20, true, now()),
  ('jezyk-angielski',        '[DEMO] Język angielski',        'Przykładowy opis kategorii językowej.',     'languages', 30, true, now()),
  ('rozwoj-oprogramowania',  '[DEMO] Rozwój oprogramowania',  'Przykładowy opis kategorii IT.',            'code',      40, true, now()),
  ('projekty-br',            '[DEMO] Projekty B+R',           'Przykładowy opis kategorii B+R.',           'flask',     50, true, now());

-- Trenerzy (fikcyjni) --------------------------------------------------------
insert into public.trainers (slug, full_name, headline, bio, competences, photo_url, is_published, published_at, sort_order) values
  ('jan-przykladowy',  '[DEMO] Jan Przykładowy',  'Praktyk (dane demonstracyjne)', 'Fikcyjny biogram trenera na potrzeby środowiska lokalnego.', array['AI','MLOps'],        null, true, now(), 10),
  ('anna-testowa',     '[DEMO] Anna Testowa',     'Ekspertka (dane demonstracyjne)', 'Fikcyjny biogram trenerki na potrzeby środowiska lokalnego.', array['ESG','Raportowanie'], null, true, now(), 20);

-- Szkolenia (fikcyjne).
-- Rekord ESG ma w tresci „zrównoważony” Z diakrytykami — testu wyszukiwania bez
-- polskich znakow NIE obsluguje jednak ten zasiew: `tests/integration/search.test.ts`
-- (P6a) zaklada wlasna pozycje przez `createTraining()`, wiec jest niezalezny od
-- tego pliku. Poprzedni komentarz twierdzil inaczej i byl nieaktualny.
insert into public.trainings
  (slug, title, summary, description, category_id, level, duration_hours, price_net_pln,
   funding_available, program, learning_outcomes, target_audience, terms_note,
   is_featured, is_published, published_at, sort_order, seo_title, seo_description)
values
  ('wprowadzenie-do-ai',
   '[DEMO] Wprowadzenie do AI',
   'Przykładowe szkolenie wprowadzające do sztucznej inteligencji.',
   'Fikcyjny opis szczegółowy szkolenia demonstracyjnego o AI.',
   (select id from public.categories where slug = 'ai'),
   'podstawowy', 16.0, 1990.00, true,
   '[{"title":"Moduł 1","items":["Podstawy","Zastosowania"]}]'::jsonb,
   array['Rozumie podstawy AI','Zna typowe zastosowania'],
   'Osoby początkujące', 'Najbliższe terminy: dane demonstracyjne.',
   true, true, now(), 10, '[DEMO] Wprowadzenie do AI', 'Przykładowy opis SEO szkolenia o AI.'),

  ('zrownowazony-rozwoj-esg',
   '[DEMO] Zrównoważony rozwój i ESG w praktyce',
   'Przykładowe szkolenie o zrównoważonym rozwoju i raportowaniu ESG.',
   'Fikcyjny opis szczegółowy szkolenia demonstracyjnego o ESG i zrównoważonym rozwoju.',
   (select id from public.categories where slug = 'esg'),
   'sredniozaawansowany', 24.0, 2990.00, false,
   '[{"title":"Moduł 1","items":["Wprowadzenie do ESG","Raportowanie"]}]'::jsonb,
   array['Rozumie zasady ESG','Potrafi przygotować raport'],
   'Specjaliści ds. zrównoważonego rozwoju', 'Najbliższe terminy: dane demonstracyjne.',
   false, true, now(), 20, '[DEMO] ESG w praktyce', 'Przykładowy opis SEO szkolenia o ESG.'),

  ('angielski-techniczny',
   '[DEMO] Angielski techniczny dla IT',
   'Przykładowe szkolenie z angielskiego technicznego.',
   'Fikcyjny opis szczegółowy szkolenia demonstracyjnego z języka angielskiego.',
   (select id from public.categories where slug = 'jezyk-angielski'),
   'sredniozaawansowany', 40.0, 3490.00, false,
   '[{"title":"Moduł 1","items":["Słownictwo IT","Komunikacja"]}]'::jsonb,
   array['Swobodnie komunikuje się w IT po angielsku'],
   'Zespoły IT', 'Najbliższe terminy: dane demonstracyjne.',
   false, true, now(), 30, '[DEMO] Angielski techniczny', 'Przykładowy opis SEO szkolenia językowego.');

-- Powiazania szkolenie <-> trener -------------------------------------------
insert into public.training_trainers (training_id, trainer_id, sort_order) values
  ((select id from public.trainings where slug = 'wprowadzenie-do-ai'),      (select id from public.trainers where slug = 'jan-przykladowy'), 10),
  ((select id from public.trainings where slug = 'zrownowazony-rozwoj-esg'), (select id from public.trainers where slug = 'anna-testowa'),    10);
