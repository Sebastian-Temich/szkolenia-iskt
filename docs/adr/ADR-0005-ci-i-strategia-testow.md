# ADR-0005 — Strategia CI i testów

- **Status:** **zatwierdzony przez ISKT 2026-10-09** (bramka planu zamknięta). Zweryfikowany wobec CI i zestawu testów 2026-10-10 w etapie E9T — patrz „Stan implementacji (E9T)” na końcu dokumentu.
- **Data:** 2026-10-09 (decyzja), 2026-10-10 (weryfikacja wobec implementacji)
- **Autor:** Koordynator Techniczny / Intake Lead
- **Powiązane:** [ADR-0001](ADR-0001-stack-aplikacji.md), [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md), [ADR-0003](ADR-0003-model-danych-migracje-rls.md)

## Kontekst

Zlecenie wymaga GitHub Actions jako obowiązkowej bramki (lint, typecheck, testy, build) oraz testów E2E dla kluczowych ścieżek. Standard organizacyjny Intake Leada domyślnie stawia Forgejo local jako pierwszą bramkę CI — w tym projekcie trzeba to jawnie rozstrzygnąć.

## Decyzje

### D1. Cel CI: GitHub Actions. Forgejo local pominięty

**Powód pominięcia Forgejo:** ISKT wskazał w zleceniu GitHub Actions jako obowiązkową bramkę CI, a Project Access Card wpisuje „Forgejo — nie dotyczy”. Utrzymywanie drugiego systemu CI dla jednego repozytorium MVP podwaja koszt konfiguracji bez dodatkowego dowodu jakości. Zapis jest wymaganym uzasadnieniem odstępstwa od domyślnego standardu.

### D2. Workflow `ci.yml` — trzy zadania

```
quality  (zawsze)      → setup Node 22 LTS, npm ci, lint, typecheck, test:unit, build
database (zawsze)      → supabase start, supabase db reset, test:integration (RLS + zapis zgłoszeń)
e2e      (zawsze)      → supabase start + build + playwright test (+ skan axe)
```

- `quality` i `database` biegną równolegle; `e2e` po `quality` (korzysta z artefaktu builda).
- Współbieżność: `concurrency: ci-${{ github.ref }}` z `cancel-in-progress: true`.
- Cache: `actions/setup-node` z `cache: npm`, cache przeglądarek Playwright.
- Wyzwalacze: `pull_request` na `main` i `push` na `main`.
- Artefakty przy porażce: raport Playwright, zrzuty ekranu, logi Supabase CLI.
- Zmienne środowiskowe w CI: wyłącznie lokalne klucze stacku Supabase i `MAIL_TRANSPORT=log`. **Żaden sekret ISKT nie jest potrzebny do przejścia CI** i żaden nie zostaje dodany do repozytorium ani do sekretów Actions na tym etapie.

### D3. Bramka merge

Na `main` wymagane: `quality`, `database`, `e2e` oraz co najmniej jedno zatwierdzenie w code review. Bez bezpośrednich commitów na `main` (Project Access Card). Konfiguracja branch protection w GitHubie wymaga uprawnień właściciela repozytorium — zadanie dla ISKT, wypisane jako otwarty punkt.

> **Korekta wykonawcza 2026-10-21 (ISK-394 / ISK-395).** Bramka jest włączona, ale **bez** wymogu zatwierdzenia po stronie GitHuba: `required_approving_review_count = 0` przy `enforce_admins = true`. Powód jest techniczny, nie procesowy — repozytorium ma jednego współpracownika, a GitHub odrzuca zatwierdzenie własnego pull requesta (`422 "Review Can not approve your own pull request"`), więc wymóg `1` był niespełnialny i wymuszał `enforce_admins = false`, czyli obejście **wszystkich** warunków naraz. Decyzja ISKT z 2026-10-21: pull request jest obowiązkowy dla wszystkich (także dla właściciela repozytorium), zielone `quality`, `database` i `e2e` są nieobchodzalnym warunkiem scalenia, a **review merytoryczne prowadzimy w Paperclipie**. Po dodaniu drugiego konta GitHub z uprawnieniem `write` wracamy do `required_approving_review_count >= 1`; zdanie powyżej opisuje wtedy stan docelowy bez zmian.

### D4. Piramida testów i podział odpowiedzialności

| Poziom       | Narzędzie                 | Zakres                                                                                                         | Właściciel                  |
| ------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Jednostkowe  | Vitest                    | schematy Zod, helpery antyspamowe, przejścia statusów, mapowanie danych, helpery SEO i slugów, redakcja logów  | autor kodu                  |
| Integracyjne | Vitest + lokalny Supabase | polityki RLS (pozytywne i negatywne), odtworzenie migracji, zapis zgłoszenia, trigger niezmienności zgłoszenia | Inżynier Backend / Supabase |
| E2E          | Playwright                | krytyczne ścieżki użytkownika i administratora                                                                 | QA / Tester                 |
| Dostępność   | `@axe-core/playwright`    | strona główna, katalog, szczegół szkolenia, trenerzy, kontakt, formularz, logowanie                            | QA / Tester                 |
| Manualne     | —                         | RWD na telefonie/tablecie/desktopie, przegląd treści, nawigacja klawiaturą, czytnik ekranu                     | QA / Tester, UX Reviewer    |

### D5. Krytyczne ścieżki E2E (minimalny zakres przed odbiorem)

1. Strona główna → katalog → filtr po kategorii → wyszukiwanie → szczegół szkolenia.
2. Szkolenie nieopublikowane nie jest dostępne publicznie (lista i bezpośredni URL → 404).
3. Wysłanie formularza jako osoba indywidualna → ekran potwierdzenia.
4. Wysłanie formularza jako firma → ekran potwierdzenia.
5. Formularz bez zgody RODO → brak wysłania, komunikat błędu.
6. Logowanie administratora → panel; wejście na `/panel` bez sesji → przekierowanie na logowanie.
7. Administrator tworzy szkolenie, publikuje je, pozycja pojawia się publicznie; wycofuje, pozycja znika.
8. Administrator widzi zgłoszenie ze statusem `nowe` i zmienia status na `w_toku`, a następnie `zamkniete`.
9. Użytkownik zalogowany bez uprawnień administratora nie wchodzi do panelu.

### D6. TDD tam, gdzie wymaga tego zlecenie

Testy pisane przed implementacją dla: walidacji formularza, przepływu zapisu zgłoszenia, przejść statusów, kontroli dostępu (RLS i middleware). Dla warstwy prezentacyjnej dopuszczamy testy po implementacji — wymuszanie TDD na komponentach wizualnych nie daje tu wartości.

### D7. Progi i hermetyczność

- Brak sztywnego progu pokrycia procentowego; zamiast tego **lista obowiązkowa**: każdy przypadek z sekcji „Wymagane testy” w [`model-danych.md`](../architektura/model-danych.md) oraz z D5 musi mieć test. Przegląd kompletności wykonuje QA, a weryfikację Delivery Controller.
- Testy nie korzystają z sieci publicznej: Resend zamockowany (`MAIL_TRANSPORT=log`), Supabase lokalny, brak zewnętrznych fontów i obrazów w testach E2E.
- Dane testowe fikcyjne, e-maile w domenie `example.invalid`.

## Konsekwencje

- Zadanie `database` i `e2e` uruchamiają Dockera w runnerze GitHuba — wydłuża to CI do kilku minut. Repozytorium jest obecnie **publiczne**, więc minuty Actions są bezpłatne; zmiana widoczności na prywatną przeniesie to na limit płatny (punkt dla FinOps).
- Publiczna widoczność repozytorium oznacza, że ADR-y, model danych i polityki RLS są dostępne publicznie. Z punktu widzenia bezpieczeństwa jest to akceptowalne — ochrona opiera się na politykach i sekretach, nie na nieujawnianiu schematu — ale wymaga dyscypliny: żadnych identyfikatorów projektów, adresów środowisk ani danych kontaktowych wykraczających poza informacje już publiczne.
- Każdy PR dowodzi, że migracje odtwarzają się od zera — spełnia wymóg „test odtworzenia” z tabeli ryzyk.
- Brak bramki Forgejo oznacza, że GitHub Actions jest pojedynczym punktem awarii CI; akceptowane, uzasadnienie w D1.

## Wymagane decyzje i czynności ISKT

1. Akceptacja pominięcia Forgejo local (D1).
2. Włączenie branch protection na `main` z wymaganymi checkami (D3) — wymaga uprawnień właściciela repozytorium.
3. Potwierdzenie, czy repozytorium ma pozostać **publiczne** (stan obecny). Publiczne: bezpłatne CI, ale pełna jawność dokumentacji i kodu. Prywatne: limit minut Actions, mniejsza ekspozycja.

> **Rozstrzygnięcie:** punkt 1 zatwierdzony przez ISKT 2026-10-09. Punkt 3 **zamknięty** — ISKT potwierdziło 2026-10-09, że repozytorium **pozostaje publiczne**; decyzja świadoma, a reguła „zero identyfikatorów środowisk w repo” obowiązuje na stałe (weryfikacja wykonana w bramce E7). Ryzyko kosztu minut GitHub Actions jest w związku z tym **nieaktualne** — CI publicznego repozytorium jest bezpłatne. Punkt 2 jest **zamknięty** — branch protection na `main` włączona i zweryfikowana 2026-10-21 (ISK-394), a polityka review rozstrzygnięta przez ISKT 2026-10-21 (ISK-395); stan faktyczny opisuje korekta w D3 oraz pozycja I28 w [skonsolidowanej liście ISKT](../odbior/braki-i-decyzje-iskt.md).

---

## Stan implementacji (E9T, 2026-10-10)

Sekcja dopisana w etapie E9T. Decyzje D1–D7 powyżej pozostają bez zmian.

### D1 — pominięcie Forgejo: zrealizowane

W repozytorium jest wyłącznie GitHub Actions. Zgodnie z uzasadnieniem decyzji.

### D2 — workflow: trzy zadania zgodnie z decyzją, plus jeden plik tymczasowy

`.github/workflows/ci.yml` ma dokładnie trzy zadania, z wyzwalaczami `pull_request` i `push` na `main`, współbieżnością `ci-${{ github.ref }}` z `cancel-in-progress`, cache npm i cache przeglądarek Playwright, oraz artefaktami diagnostycznymi przy porażce:

| Zadanie    | Kroki                                                                                          | Zależności       |
| ---------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| `quality`  | `npm ci`, `lint`, `typecheck`, `test:unit`, `build`                                            | —                |
| `database` | `supabase start`, `scripts/ci-export-supabase-env.sh`, `supabase db reset`, `test:integration` | —                |
| `e2e`      | `supabase start`, eksport zmiennych, `build`, instalacja Chromium, `test:e2e`                  | `needs: quality` |

Zmienne w CI to wyłącznie `MAIL_TRANSPORT=log`, lokalny adres aplikacji, adres testowy odbiorcy w domenie `example.invalid` oraz **generowane dla CI** `FORM_TOKEN_SECRET` i `FORM_THROTTLE_SALT`. Żaden sekret ISKT nie jest potrzebny do przejścia CI i żaden nie został dodany do sekretów Actions. Klucze Supabase pochodzą wyłącznie ze stacku uruchomionego przez samo CI.

**Plik tymczasowy do usunięcia po scaleniu E1:** `.github/workflows/ci-e2-database.yml` — minimalny, samowystarczalny workflow z zadaniem `database`, dowieziony przez E2, bo branch E2 wychodził od `main`, który nie miał jeszcze harnessu z E1. Dziś oba workflow biegną obok siebie i zadanie `database` wykonuje się **dwa razy na każdym PR**. Plik ma w nagłówku warunek usunięcia; jego własny komentarz jest nadal poprawny i aktualny.

**Odstępstwo w jednym kroku `e2e`, warte zapisania (E6, defekt POW-3).** Job `e2e` budował aplikację, a testował serwer deweloperski. To nie było tylko marnotrawstwo: w trybie dev każda nieskompilowana trasa kompiluje się na żądanie, więc przy kilku workerach równoczesne wejścia w trasy panelu kończyły się `net::ERR_ABORTED` i przerwanymi nawigacjami — testy padały, mimo że aplikacja była sprawna. Naprawione zmienną `PLAYWRIGHT_USE_BUILD=1`, która przełącza `playwright.config.ts` na artefakt builda.

**Nieobjęte bramką:** `npm run format:check` istnieje w `package.json`, ale **żadne zadanie CI go nie uruchamia**. Formatowanie nie jest więc egzekwowane — na dzień 2026-10-10 narzędzie raportuje odstępstwa w kilkudziesięciu plikach wniesionych przez różne etapy. Świadomie nie przeformatowano repozytorium w E9T (masowa zmiana formatu zasłoniłaby diff dokumentacji).

Ustalenie bramki E7 (N1): warto dodać `npm audit --omit=dev` jako krok CI, żeby realne podatności runtime nie utonęły w szumie podatności narzędziowych w `devDependencies`.

**Źródło obrazów lokalnego stacku w CI (ISK-398, 2026-10-21).** Supabase CLI 2.109.1 pobiera 13 obrazów równolegle, domyślnie z `public.ecr.aws`. Anonimowy pull z ECR Public ma limit **1 pull/s na adres IP**, a runnery GitHuba dzielą adresy — na merge commicie `b9b0e8a` dało to **43 odpowiedzi `toomanyrequests: Rate exceeded`** (4 w `database`, 39 w `e2e`). Bramka była zielona wyłącznie dzięki ponowieniom CLI, więc od włączenia branch protection to było ciche ryzyko zablokowania dostawy bez związku ze zmianą w kodzie. Decyzja: `ci.yml` ustawia `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io` i loguje się do `ghcr.io` wbudowanym `GITHUB_TOKEN` (`packages: read`), czyli pull jest uwierzytelniony i **nie wymaga żadnego nowego sekretu repozytorium**. Zmierzone przed wdrożeniem: wszystkie 13 obrazów jest opublikowanych jako `ghcr.io/supabase/<nazwa>`, natomiast Docker Hub nie hostuje 5 z nich pod `supabase/` (`imgproxy`, `kong`, `mailpit`, `vector`, `postgrest`) — dlatego pierwotna propozycja „zaloguj się do Docker Huba” nie rozwiązywała tego problemu. Start stacku idzie przez `scripts/ci-start-supabase.sh`, który raportuje liczbę trafień limitu i faktyczny rejestr w podsumowaniu zadania; skrypt **nie maskuje** błędu `supabase start` (propaguje kod wyjścia) i celowo nie czerwieni bramki od samego throttlingu rejestru.

**Pobieranie obrazów odebrane CLI (ISK-420, 2026-10-22).** Przeniesienie rejestru okazało się niewystarczające: ok. 20:10 UTC limit zaczął zgłaszać **sam `ghcr.io`** (`toomanyrequests: allowed: 44000/minute`) i `database` oraz `e2e` padały w kroku `Start local Supabase`, zanim uruchomił się jakikolwiek test — 8 obrazów nie zostało pobranych, a `supabase start` kończył się kodem 1. Ponowne uruchomienie **niezmienionego, wcześniej zielonego** przebiegu `39759359872` dało odwrotny wynik, co wyklucza wpływ czyjegokolwiek diffu.

Pomiary z 2026-10-22, które wyznaczyły kierunek naprawy:

| sonda                                                        | wynik                          |
| ------------------------------------------------------------ | ------------------------------ |
| `ghcr.io`, 5 szeregowych zapytań o manifest, anonimowo       | 3 OK / 2× HTTP 429             |
| `ghcr.io`, 5 szeregowych zapytań o manifest, uwierzytelnione | 4 OK / 1× HTTP 429             |
| `ghcr.io`, 14 obrazów × 3 próby                              | 2 OK / 7 FAIL                  |
| `public.ecr.aws`, 14 obrazów, 1 zapytanie/s                  | **14/14 → HTTP 200, zero 429** |

Wnioski: (a) to **nie jest** wyłącznie kształt bursta — odrzucane są też pojedyncze, szeregowe zapytania, i to z adresu IP niemającego nic wspólnego z runnerami; (b) **uwierzytelnienie nie pomaga**, więc dokładanie sekretów czy kolejnych loginów jest bezcelowe; (c) `retry-after` jest rzędu mikrosekund, czyli **ponowienie działa od razu**; (d) żaden z dwóch rejestrów nie jest sam w sobie bezpieczny, bo w ISK-398 padał ECR Public, a tutaj ghcr.io.

Decyzja: obrazy pobiera `scripts/ci-prepull-supabase-images.sh` **przed** `supabase start` — szeregowo (jeden `docker pull` naraz zamiast 14 równolegle), z ponowieniem i narastającym odstępem, oraz z **rejestrem zapasowym** (`SUPABASE_FALLBACK_IMAGE_REGISTRY=public.ecr.aws`); obraz wzięty z zapasowego jest przypinany przez `docker tag` pod nazwą z `ghcr.io`, bo właśnie tej nazwy CLI szuka w lokalnym cache. Po pierwszym udanym pobraniu z rejestru zapasowego skrypt zaczyna od niego, żeby nie płacić nieudaną próbą za każdy kolejny obraz. `supabase start` zastaje pełny cache i nie pobiera niczego.

Rozkład odpowiedzialności bramek jest celowy i **nie** jest dosłownym wykonaniem punktu 4 zgłoszenia:

| warunek                                                                         | reakcja                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------ |
| brak choćby jednego obrazu po wszystkich próbach na obu rejestrach              | **kod 1** + `::error::` z listą braków     |
| `supabase start` sam pobiera jakikolwiek obraz (`obrazy pobierane: 0` wymagane) | **kod 1** + `::error::` z nazwami serwisów |
| trafienie limitu, które ponowienie nadrobiło                                    | `::warning::` + licznik w podsumowaniu     |

Zgłoszenie proponowało podnieść do rangi bramki licznik `trafienia limitu: 0`. Celowo tego nie zrobiono: skoro pojedyncze zapytanie ma ~20–40% szans na 429, licznik > 0 zdarza się przy poprawnym wyniku i czerwieniłby dostawę od drgnięcia infrastruktury — dokładnie to ryzyko, które ta karta usuwa. Zamiast tego bramkowane są dwie wielkości w pełni pod naszą kontrolą i deterministyczne: kompletność cache'u (bez obrazu start i tak nie wystartuje) oraz **zerowy ruch do rejestru w trakcie startu**. Mierzalne kryterium odbioru jest widoczne w podsumowaniu zadania: `obrazy obecne jako ghcr.io/supabase/*: 14`, `obrazy pobierane w trakcie startu: 0 (wymagane: 0)` oraz `trafienia limitu czestosci rejestru w trakcie startu: 0 (oczekiwane: 0)`.

Druga bramka powstała z własnego błędu pierwszego podejścia i dowodzi swojej wartości: na przebiegu `39850884343` pre-pull pobrał 13 obrazów, CLI zgłosił 12 z nich jako „Skipped - Image is already present locally”, ale **`kong` jako „Pulling”** — i właśnie na nim start padł. Faktyczny zestaw to **14** obrazów (10 z `supabase services` plus `kong`, `mailpit`, `vector`, `imgproxy`, których to polecenie nie raportuje), a nie 13, jak zakładał ISK-398. Bez tej bramki kolejne przeoczenie ujawniłoby się dopiero w chorej chwili rejestru, czyli znowu zatrzymując całą dostawę. Rozjazd listy względem CLI pojawia się wyłącznie przy świadomej zmianie wersji w `ci.yml` (`supabase/setup-cli@v1`), więc nie jest to źródło losowej czerwieni.

Nie serializowano zadań `database` i `e2e` (rozważane jako punkt 3 zgłoszenia): przy szeregowym pre-pullu dwa równoległe zadania generują **najwyżej 2** jednoczesne pobrania zamiast ~28, a wymuszenie kolejności podwoiłoby czas trwania bramki.

### D3 — bramka merge: wymaga czynności ISKT

Checki `quality`, `database` i `e2e` istnieją i przechodzą. **Branch protection na `main` nie jest włączone** — wymaga uprawnień właściciela repozytorium. Konsekwencja na dziś: nic nie wymusza przejścia CI ani review przed scaleniem do `main`.

### D4 i D6 — piramida testów i TDD: zrealizowane

Stan na 2026-10-10: **18 plików testów jednostkowych**, **9 plików testów integracyjnych**, **9 plików E2E** (`73` zdefiniowane przypadki Playwrighta). Podział odpowiedzialności zgodny z tabelą decyzji. Testy dla walidacji, przepływu zapisu, przejść statusów i kontroli dostępu powstały przed implementacją.

### D5 — krytyczne ścieżki E2E: wszystkie dziewięć pokryte

Mapowanie potwierdzone w bramce QA (E6):

| Ścieżka                                                              | Plik testu                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------ |
| D5.1 strona główna → katalog → filtr → wyszukiwanie → szczegół       | `tests/e2e/katalog-sciezka.spec.ts`                          |
| D5.2 szkolenie nieopublikowane niedostępne (lista i bezpośredni URL) | `tests/e2e/public-pages.spec.ts`                             |
| D5.3 zgłoszenie — osoba indywidualna                                 | `tests/e2e/formularz-zgloszenia.spec.ts`                     |
| D5.4 zgłoszenie — firma                                              | `tests/e2e/formularz-zgloszenia.spec.ts`                     |
| D5.5 brak zgody RODO → błąd, brak wysłania                           | `tests/e2e/formularz-zgloszenia.spec.ts`                     |
| D5.6 logowanie administratora; `/panel` bez sesji → przekierowanie   | `tests/e2e/panel-dostep.spec.ts`                             |
| D5.7 utworzenie → publikacja → wycofanie                             | `tests/e2e/panel-katalog.spec.ts`, `tests/e2e/panel.spec.ts` |
| D5.8 cykl statusu `nowe → w_toku → zamkniete`                        | `tests/e2e/panel.spec.ts`                                    |
| D5.9 zalogowany bez uprawnień nie wchodzi do panelu                  | `tests/e2e/panel-dostep.spec.ts`                             |

Wyniki bramki QA (E6, werdykt „przeszła warunkowo”): 52 testy zielone lokalnie i w CI; 21 pominiętych to w całości `visual-evidence.spec.ts` — generator dowodów RWD świadomie pomijany bez zmiennej `EVIDENCE_DIR`, uruchamiany lokalnie (30 zrzutów przy 360/768/1280 px). Trzy skany `axe` panelu są oznaczone `test.fail()` i dokumentowały defekt kontrastu POW-4 — wybór `test.fail()` zamiast `skip` był celowy, bo po naprawie Playwright zgłasza „expected to fail but passed" i wymusza zdjęcie adnotacji. Skan `axe` bez naruszeń krytycznych i poważnych na wszystkich 7 wymaganych widokach (łącznie z formularzem **w stanie błędu walidacji** — osobny przypadek, bo drzewo dostępności jest wtedy inne).

### D7 — hermetyczność: zrealizowana, po naprawie dwóch poważnych luk

Lista obowiązkowa: wszystkie 16 przypadków z §5 modelu danych i wszystkie 9 ścieżek D5 mają faktyczny test; po naprawie ISK-356 doszły trzy przypadki uprawnień funkcji (`tests/integration/function-grants.test.ts`) i trzy przypadki hermetyczności (`tests/integration/hermeticity.test.ts`). Testy nie korzystają z sieci publicznej, dane są fikcyjne, adresy w domenie `example.invalid`.

Dwie luki, które bramka QA (E6) znalazła w samej hermetyczności — oba naprawione, oba warte zapamiętania:

1. **Bramka hermetyczności była importowana, ale nie istniała.** `assertLocalStack` był importowany z helpera E2, gdzie **nigdy nie został zdefiniowany**, a `globalSetup` nie był wpisany do `playwright.config.ts`. Bramka nie działała, a konta lokalne dla ścieżek D5.6 i D5.9 nie były tworzone.
2. **`npm run test:integration` mógł celować w projekt hostowany** (defekt BLK-1, naprawa ISK-358) — opis w [ADR-0002](ADR-0002-srodowisko-lokalne-i-supabase.md#1-zakaz-operacji-na-projekcie-produkcyjnym--dotrzymany).

### Wymóg procesowy wynikający z bramki E7 — do wpisania w proces

Bramka security review sformułowała wymóg, którego ta decyzja nie zawierała, a którego brak przepuścił defekt krytyczny: **testy bezpieczeństwa z gałęzi etapowych muszą biec na linii integracyjnej.** Poprawka P0 z ISK-356 była napisana, przejrzana i scalona na swojej gałęzi, a mimo to nie dotarła do linii integracyjnej ani nie została zauważona przez bramkę QA — bo razem z poprawką nie dotarł też jej test. Dopóki `main` jest pusty, a integracja odbywa się przez stackowanie gałęzi na snapshotach, ta klasa regresji się powtórzy.
