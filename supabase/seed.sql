-- Seed demonstracyjny — szkolenia.iskt.pl
-- UWAGA: wylacznie dane FIKCYJNE. Adresy e-mail w domenie example.invalid.
-- Zero realnych tresci, cen, terminow, nazwisk i danych osobowych
-- (ADR-0002 sekcja 6, zlecenie paragraf 4).
-- Dane sa wczytywane przez `supabase db reset` po migracjach.
--
-- GDZIE PODAJEMY, ZE DANE SA PRZYKLADOWE (ISK-409 / UX-B3)
-- Do ISK-409 kazda nazwa wlasna niosla prefiks `[DEMO]`: `categories.name`,
-- `trainings.title`, `trainers.full_name` i `trainings.seo_title`. Dawalo to
-- 29 widocznych wystapien na `/`, 19 na `/szkolenia` i 11 na `/trenerzy` —
-- pigulki filtrow brzmialy "Wszystkie / [DEMO] Sztuczna inteligencja / …",
-- a trenerzy nazywali sie "[DEMO] Jan Przykladowy". Przy takiej gestosci
-- znacznik przestal cokolwiek wyrozniac, a w nazwie wlasnej i tak nie
-- chronil niczego: nazwa kategorii nie jest twierdzeniem o faktach.
-- Teraz sygnal jest podawany RAZ, w pasku nad naglowkiem
-- (`app/(public)/layout.tsx`), a `[DEMO]` zostaje wylacznie przy
-- TWIERDZENIACH w tresci redakcyjnej (`lib/audience.ts`, sekcje
-- marketingowe, adres, dofinansowanie) — razem ze zdaniem w stopce, ktore
-- go objasnia.
-- Fikcyjnosc samych wierszy nadal widac w tresci: opisy zaczynaja sie od
-- "Przykladowy"/"Fikcyjny", a nazwiska trenerow sa jawnie wymyslone
-- ("Jan Przykladowy", "Anna Testowa").

-- Kategorie (lista startowa wg model-danych.md sekcja 3.2) --------------------
insert into public.categories (slug, name, description, icon, sort_order, is_published, published_at) values
  ('ai',                     'Sztuczna inteligencja', 'Przykładowy opis kategorii AI.',        'cpu',       10, true, now()),
  ('esg',                    'ESG',                   'Przykładowy opis kategorii ESG.',       'leaf',      20, true, now()),
  ('jezyk-angielski',        'Język angielski',       'Przykładowy opis kategorii językowej.', 'languages', 30, true, now()),
  ('rozwoj-oprogramowania',  'Rozwój oprogramowania', 'Przykładowy opis kategorii IT.',        'code',      40, true, now()),
  ('projekty-br',            'Projekty B+R',          'Przykladowy opis kategorii B+R.',       'flask',     50, true, now());

-- Trenerzy (fikcyjni) --------------------------------------------------------
insert into public.trainers (slug, full_name, headline, bio, competences, photo_url, is_published, published_at, sort_order) values
  ('jan-przykladowy',  'Jan Przykładowy',  'Praktyk (dane demonstracyjne)',   'Fikcyjny biogram trenera na potrzeby środowiska lokalnego.',   array['AI','MLOps'],         null, true, now(), 10),
  ('anna-testowa',     'Anna Testowa',     'Ekspertka (dane demonstracyjne)', 'Fikcyjny biogram trenerki na potrzeby środowiska lokalnego.', array['ESG','Raportowanie'], null, true, now(), 20);

-- Szkolenia (fikcyjne). Jedno z "zrownowazony" do testu wyszukiwania bez polskich znakow.
--
-- `funding_note` BYLA POMINIETA NA LISCIE KOLUMN (ISK-409 / CR-I4)
-- Lista szla `funding_available, program, ...`, wiec kolumna zostawala NULL
-- w KAZDYM zasianym wierszu. Widok szczegolu ma dla NULL zapas
-- ("To szkolenie moze kwalifikowac sie do dofinansowania. Napisz do nas…"),
-- wiec na srodowisku demo kazde dofinansowane szkolenie pokazywalo ten sam,
-- nieoznaczony napis — a jedyny mechanizm, ktory D1 dopuszcza (informacja
-- o dofinansowaniu PER SZKOLENIE) nie byl w ogole wykonywany.
-- `zrownowazony-rozwoj-esg` dostaje `funding_available = true`, zeby
-- zroznicowanie bylo MIERZALNE: przy jednym dofinansowanym wierszu nie da sie
-- odroznic "czytamy kolumne" od "trafilismy w zapas". Teraz dwa wiersze maja
-- dwie ROZNE tresci, a trzeci zostaje bez dofinansowania jako negatyw.
insert into public.trainings
  (slug, title, summary, description, category_id, level, duration_hours, price_net_pln,
   funding_available, funding_note, program, learning_outcomes, target_audience, terms_note,
   is_featured, is_published, published_at, sort_order, seo_title, seo_description)
values
  ('wprowadzenie-do-ai',
   'Wprowadzenie do AI',
   'Przykładowe szkolenie wprowadzające do sztucznej inteligencji.',
   'Fikcyjny opis szczegółowy szkolenia demonstracyjnego o AI.',
   (select id from public.categories where slug = 'ai'),
   'podstawowy', 16.0, 1990.00, true,
   '[DEMO] Przykładowa informacja o dofinansowaniu dla szkolenia z AI — treść do uzupełnienia przez ISKT.',
   '[{"title":"Moduł 1","items":["Podstawy","Zastosowania"]}]'::jsonb,
   array['Rozumie podstawy AI','Zna typowe zastosowania'],
   'Osoby początkujące', 'Najbliższe terminy: dane demonstracyjne.',
   true, true, now(), 10, 'Wprowadzenie do AI', 'Przykładowy opis SEO szkolenia o AI.'),

  ('zrownowazony-rozwoj-esg',
   'Zrównoważony rozwój i ESG w praktyce',
   'Przykładowe szkolenie o zrównoważonym rozwoju i raportowaniu ESG.',
   'Fikcyjny opis szczegółowy szkolenia demonstracyjnego o ESG i zrównoważonym rozwoju.',
   (select id from public.categories where slug = 'esg'),
   'sredniozaawansowany', 24.0, 2990.00, true,
   '[DEMO] Przykładowa informacja o dofinansowaniu dla szkolenia ESG — inna treść niż przy AI, żeby było widać, że pochodzi z kolumny.',
   '[{"title":"Moduł 1","items":["Wprowadzenie do ESG","Raportowanie"]}]'::jsonb,
   array['Rozumie zasady ESG','Potrafi przygotować raport'],
   'Specjaliści ds. zrównoważonego rozwoju', 'Najbliższe terminy: dane demonstracyjne.',
   false, true, now(), 20, 'ESG w praktyce', 'Przykładowy opis SEO szkolenia o ESG.'),

  ('angielski-techniczny',
   'Angielski techniczny dla IT',
   'Przykładowe szkolenie z angielskiego technicznego.',
   'Fikcyjny opis szczegółowy szkolenia demonstracyjnego z języka angielskiego.',
   (select id from public.categories where slug = 'jezyk-angielski'),
   'sredniozaawansowany', 40.0, 3490.00, false,
   null,
   '[{"title":"Moduł 1","items":["Słownictwo IT","Komunikacja"]}]'::jsonb,
   array['Swobodnie komunikuje się w IT po angielsku'],
   'Zespoły IT', 'Najbliższe terminy: dane demonstracyjne.',
   false, true, now(), 30, 'Angielski techniczny', 'Przykładowy opis SEO szkolenia językowego.');

-- Powiazania szkolenie <-> trener -------------------------------------------
insert into public.training_trainers (training_id, trainer_id, sort_order) values
  ((select id from public.trainings where slug = 'wprowadzenie-do-ai'),      (select id from public.trainers where slug = 'jan-przykladowy'), 10),
  ((select id from public.trainings where slug = 'zrownowazony-rozwoj-esg'), (select id from public.trainers where slug = 'anna-testowa'),    10);
