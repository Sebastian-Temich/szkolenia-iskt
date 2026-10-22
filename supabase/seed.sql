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
  ('ai',                     'Sztuczna inteligencja', 'Przykladowy opis kategorii AI.',        'cpu',       10, true, now()),
  ('esg',                    'ESG',                   'Przykladowy opis kategorii ESG.',       'leaf',      20, true, now()),
  ('jezyk-angielski',        'Jezyk angielski',       'Przykladowy opis kategorii jezykowej.', 'languages', 30, true, now()),
  ('rozwoj-oprogramowania',  'Rozwoj oprogramowania', 'Przykladowy opis kategorii IT.',        'code',      40, true, now()),
  ('projekty-br',            'Projekty B+R',          'Przykladowy opis kategorii B+R.',       'flask',     50, true, now());

-- Trenerzy (fikcyjni) --------------------------------------------------------
insert into public.trainers (slug, full_name, headline, bio, competences, photo_url, is_published, published_at, sort_order) values
  ('jan-przykladowy',  'Jan Przykladowy',  'Praktyk (dane demonstracyjne)',   'Fikcyjny biogram trenera na potrzeby srodowiska lokalnego.',   array['AI','MLOps'],         null, true, now(), 10),
  ('anna-testowa',     'Anna Testowa',     'Ekspertka (dane demonstracyjne)', 'Fikcyjny biogram trenerki na potrzeby srodowiska lokalnego.', array['ESG','Raportowanie'], null, true, now(), 20);

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
   'Przykladowe szkolenie wprowadzajace do sztucznej inteligencji.',
   'Fikcyjny opis szczegolowy szkolenia demonstracyjnego o AI.',
   (select id from public.categories where slug = 'ai'),
   'podstawowy', 16.0, 1990.00, true,
   '[DEMO] Przykladowa informacja o dofinansowaniu dla szkolenia z AI — tresc do uzupelnienia przez ISKT.',
   '[{"title":"Modul 1","items":["Podstawy","Zastosowania"]}]'::jsonb,
   array['Rozumie podstawy AI','Zna typowe zastosowania'],
   'Osoby poczatkujace', 'Najblizsze terminy: dane demonstracyjne.',
   true, true, now(), 10, 'Wprowadzenie do AI', 'Przykladowy opis SEO szkolenia o AI.'),

  ('zrownowazony-rozwoj-esg',
   'Zrownowazony rozwoj i ESG w praktyce',
   'Przykladowe szkolenie o zrownowazonym rozwoju i raportowaniu ESG.',
   'Fikcyjny opis szczegolowy szkolenia demonstracyjnego o ESG i zrownowazonym rozwoju.',
   (select id from public.categories where slug = 'esg'),
   'sredniozaawansowany', 24.0, 2990.00, true,
   '[DEMO] Przykladowa informacja o dofinansowaniu dla szkolenia ESG — inna tresc niz przy AI, zeby bylo widac, ze pochodzi z kolumny.',
   '[{"title":"Modul 1","items":["Wprowadzenie do ESG","Raportowanie"]}]'::jsonb,
   array['Rozumie zasady ESG','Potrafi przygotowac raport'],
   'Specjalisci ds. zrownowazonego rozwoju', 'Najblizsze terminy: dane demonstracyjne.',
   false, true, now(), 20, 'ESG w praktyce', 'Przykladowy opis SEO szkolenia o ESG.'),

  ('angielski-techniczny',
   'Angielski techniczny dla IT',
   'Przykladowe szkolenie z angielskiego technicznego.',
   'Fikcyjny opis szczegolowy szkolenia demonstracyjnego z jezyka angielskiego.',
   (select id from public.categories where slug = 'jezyk-angielski'),
   'sredniozaawansowany', 40.0, 3490.00, false,
   null,
   '[{"title":"Modul 1","items":["Slownictwo IT","Komunikacja"]}]'::jsonb,
   array['Swobodnie komunikuje sie w IT po angielsku'],
   'Zespoly IT', 'Najblizsze terminy: dane demonstracyjne.',
   false, true, now(), 30, 'Angielski techniczny', 'Przykladowy opis SEO szkolenia jezykowego.');

-- Powiazania szkolenie <-> trener -------------------------------------------
insert into public.training_trainers (training_id, trainer_id, sort_order) values
  ((select id from public.trainings where slug = 'wprowadzenie-do-ai'),      (select id from public.trainers where slug = 'jan-przykladowy'), 10),
  ((select id from public.trainings where slug = 'zrownowazony-rozwoj-esg'), (select id from public.trainers where slug = 'anna-testowa'),    10);
