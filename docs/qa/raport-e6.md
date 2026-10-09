# Raport QA — Etap 6 (ISK-348)

- **Zakres:** bramka jakosci MVP `szkolenia.iskt.pl` — 9 krytycznych sciezek E2E (ADR-0005 D5), dostepnosc WCAG 2.1 AA, RWD, kompletnosc pokrycia wobec `model-danych.md` §5.
- **Data:** 2026-10-09
- **Wlasciciel:** QA / Tester
- **Branch:** `qa/isk-348-e2e` (integracja E1 + E2 + E3 + E4 + E5)
- **Srodowisko:** wylacznie lokalny stack Supabase CLI, `MAIL_TRANSPORT=log`. Zero ruchu do sieci publicznej, zero kontaktu z projektem hostowanym.

> Werdykt i pelna lista defektow — na koncu dokumentu.

## 1. Jak uruchomic ten zestaw

Testy nie czytaja `.env.local` w procesie Playwrighta, a `stackEnv()` ma pulapke
pierwszenstwa zmiennych (patrz defekt BLK-1). Dlatego w repozytorium sa dwa
skrypty, ktore wymuszaja parametry lokalnego stacku:

```bash
# testy integracyjne (RLS, triggery, seed)
SUPABASE_DIR=/sciezka/do/katalogu/z/supabase ./scripts/integration-local.sh

# testy E2E + skany axe
SUPABASE_DIR=/sciezka/do/katalogu/z/supabase E2E_PORT=4273 ./scripts/e2e-local.sh

# dowody RWD (zrzuty w 3 szerokosciach, widoki publiczne + panel)
EVIDENCE_DIR=./artifacts/isk-348/rwd \
  SUPABASE_DIR=... E2E_PORT=4273 ./scripts/e2e-local.sh tests/e2e/visual-evidence.spec.ts
```

`E2E_PORT` jest obowiazkowy, gdy na maszynie pracuje kilka worktree tego
repozytorium — `reuseExistingServer` jest wylaczone na stale, bo "istniejacy
serwer" na wspolnym porcie bywa aplikacja z innego branchu.

## 2. Pokrycie krytycznych sciezek (ADR-0005 D5)

| # | Sciezka | Test | Status |
| --- | --- | --- | --- |
| D5.1 | Strona glowna → katalog → filtr → wyszukiwanie → szczegol | `katalog-sciezka.spec.ts` — „uzytkownik przechodzi cala sciezke klikajac…” | pokryta |
| D5.2 | Szkolenie nieopublikowane niedostepne (lista + bezposredni URL → 404) | `public-pages.spec.ts` — `describe("ochrona szkicow")`, 2 testy | pokryta |
| D5.3 | Formularz jako osoba indywidualna → potwierdzenie | `formularz-zgloszenia.spec.ts` — D5.3 | pokryta |
| D5.4 | Formularz jako firma → potwierdzenie | `formularz-zgloszenia.spec.ts` — D5.4 | pokryta |
| D5.5 | Formularz bez zgody RODO → brak wyslania + komunikat | `formularz-zgloszenia.spec.ts` — D5.5 | pokryta |
| D5.6 | Logowanie administratora → panel; `/panel` bez sesji → logowanie | `panel-dostep.spec.ts` — D5.6, 3 testy | pokryta |
| D5.7 | Administrator tworzy, publikuje (widoczne), wycofuje (znika) | `panel-katalog.spec.ts` (tworzenie przez UI) + `panel.spec.ts` — „publikacja…” | pokryta |
| D5.8 | Zgloszenie `nowe` → `w_toku` → `zamkniete` | `panel.spec.ts` — „status zgloszenia przechodzi cykl…” | pokryta |
| D5.9 | Zalogowany bez uprawnien nie wchodzi do panelu | `panel-dostep.spec.ts` — D5.9 | pokryta |

**Uwaga do D5.2.** Seed `[DEMO]` nie zawiera zadnego szkolenia nieopublikowanego,
wiec test wchodzacy na wymyslony slug dowodzilby tylko, ze nieistniejacy rekord
zwraca 404. `helpers/draft-training.ts` zaklada wiec realny wiersz
`is_published = false` kluczem `service_role` i sprawdza trzy rzeczy: 404 pod
bezposrednim URL, brak pozycji w katalogu i brak slugu w `sitemap.xml`.

**Uwaga do D5.7.** Opis sciezki zaczyna sie od „Administrator **tworzy**
szkolenie”. Scenariusz E5 (`panel.spec.ts`) zakladal szkolenie kluczem
`service_role` i testowal wylacznie przelacznik publikacji — tworzenie przez
formularz panelu (walidacja Zod, Server Action, slug) nie bylo pokryte. Luke
domyka dodany `panel-katalog.spec.ts`, ktory przechodzi pelny cykl: utworzenie
w UI → szkic niewidoczny publicznie (404) → publikacja → widocznosc na liscie
i pod URL-em → wycofanie → ponowne 404.

## 3. Pokrycie wymaganych testow RLS (`model-danych.md` §5)

Lista obowiazkowa (ADR-0005 D7) to 6 przypadkow pozytywnych i 10 negatywnych.
**Wszystkie 16 ma faktyczny test** w zestawie integracyjnym — brak luk.

| Przypadek | Test |
| --- | --- |
| P1 `anon` widzi opublikowane szkolenie/kategorie/trenera | `catalog-rls.test.ts` — „P1…” |
| P2 `anon` widzi `training_trainers`, gdy obie strony opublikowane | `catalog-rls.test.ts` — „P2…” |
| P3 Administrator widzi szkice i zgloszenia | `catalog-rls.test.ts` — „P3 (szkice)…”; `inquiries-rls.test.ts` — „P3 (zgloszenia)…” |
| P4 Status `nowe → w_toku → zamkniete` + wpisy w historii | `inquiry-triggers.test.ts` — „P4…” |
| P5 `supabase db reset` odtwarza schemat i seed | `schema.test.ts` — „P5…”, „P5 (funkcje)…” |
| P6 Wyszukiwanie bez polskich znakow i po fragmencie tytulu | `search.test.ts` — „P6a…”, „P6b…” |
| N1 `anon` nie widzi `is_published = false` | `catalog-rls.test.ts` — „N1…” |
| N2 `anon` nie widzi `training_trainers`, gdy trener jest szkicem | `catalog-rls.test.ts` — „N2…” |
| N3 `anon` `SELECT` na `inquiries` → zero wierszy | `inquiries-rls.test.ts` — „N3…” |
| N4 `anon` `INSERT` do `inquiries` → odmowa | `inquiries-rls.test.ts` — „N4…”; `inquiries-flow.test.ts` |
| N5 Zalogowany bez `admin_users` nie widzi zgloszen/szkicow, nie publikuje | `catalog-rls.test.ts` — „N5 (katalog)…”; `inquiries-rls.test.ts` — „N5 (zgloszenia)…” |
| N6 Zmiana `email`/`message` zgloszenia → wyjatek z triggera | `inquiry-triggers.test.ts` — „N6…” |
| N7 Niedozwolone przejscie `zamkniete → nowe` → wyjatek | `inquiry-triggers.test.ts` — „N7…” |
| N8 `rodo_ack = false` → naruszenie `CHECK` | `inquiry-triggers.test.ts` — „N8…” |
| N9 `kind = 'firma'` bez `company_name` → naruszenie `CHECK` | `inquiry-triggers.test.ts` — „N9…” |
| N10 Brak tabeli w `public` z wylaczonym RLS | `schema.test.ts` — „N10…” |

## 4. Dostepnosc WCAG 2.1 AA

### Skan automatyczny (`@axe-core/playwright`)

Siedem widokow wymaganych przez ADR-0005 D4 — `dostepnosc.spec.ts`:

| Widok | Sciezka |
| --- | --- |
| strona glowna | `/` |
| katalog | `/szkolenia` |
| szczegol szkolenia | `/szkolenia/wprowadzenie-do-ai` |
| trenerzy | `/trenerzy` |
| kontakt | `/kontakt` |
| logowanie | `/panel/logowanie` |
| formularz (stan bledu walidacji) | `/kontakt` po nieudanym wyslaniu |

„Formularz” jest liczony jako osobny przypadek od „kontaktu” swiadomie: po
nieudanej walidacji drzewo dostepnosci jest inne (`aria-invalid`,
`aria-describedby`, komunikaty bledow, `aria-live`) i wlasnie tam naruszenia sa
najczestsze. Skan czystej strony tego stanu nie widzi.

Ponad wymagane minimum skanowane sa takze cztery widoki panelu
(`/panel`, `/panel/szkolenia`, `/panel/trenerzy`, `/panel/zgloszenia`) —
ADR ich nie wymienia, a administrator rowniez korzysta z klawiatury.

Reguly ograniczone do tagow `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
Bramka jest **ostrzejsza niz DoD**: DoD wymaga zera naruszen *krytycznych*,
a test nie przepuszcza rowniez naruszen o wadze *serious*.

### Weryfikacja manualna zautomatyzowana

Skan axe wylapuje czesc naruszen, ale nie sprawdza, czy strona da sie
*obsluzyc*. Te rzeczy sa sprawdzane jawnymi testami, nie oswiadczeniem
w raporcie:

| Kryterium | Test |
| --- | --- |
| 2.1.1 Obsluga klawiatura — filtry katalogu osiagalne Tabem | `dostepnosc.spec.ts` — „katalog: Tab dociera do pol filtra…” |
| 2.4.7 Widocznosc focusu — kazdy element w kolejce Tab ma `outline` lub `box-shadow` | ten sam test (asercja per element) |
| 2.1.1 Formularz wypelnialny i wysylany bez myszy (wlacznie z `Space` na zgodzie i `Enter` na wysylce) | `dostepnosc.spec.ts` — „formularz: calosc da sie wypelnic i wyslac bez myszy” |
| 2.1.2 Brak pulapki focusu | `dostepnosc.spec.ts` — „brak pulapki focusu…” |
| 1.3.1 Hierarchia naglowkow — dokladnie jeden `h1`, brak przeskokow poziomow | `dostepnosc.spec.ts` — „…dokladnie jeden h1 i brak przeskokow…” (7 widokow) |
| 1.1.1 Teksty alternatywne przy `trainers.photo_url = NULL` | `dostepnosc.spec.ts` — „trenerzy: brak zdjecia nie zostawia obrazka bez alt” |
| 3.3.1 / 3.3.2 Komunikat bledu powiazany z polem (`aria-invalid` + `aria-describedby`) | `formularz-zgloszenia.spec.ts` — D5.5 |

## 5. RWD

`visual-evidence.spec.ts` generuje zrzuty w szerokosciach **360 / 768 / 1280 px**
dla 7 widokow publicznych i 4 widokow panelu (33 zrzuty) po ustawieniu
`EVIDENCE_DIR`.

Zrzut sam w sobie nie jest asercja, dlatego kazdy przypadek sprawdza dodatkowo
twarde kryterium: `documentElement.scrollWidth <= window.innerWidth`, czyli brak
poziomego przewijania. Niezaleznie od tego `public-pages.spec.ts` pilnuje, zeby
tresc miala marginesy boczne i byla wysrodkowana w kazdej z trzech szerokosci —
to regresja klasy ISK-355, gdzie kolizja nazwy klasy z utility Tailwinda
kasowala caly uklad, a strona nadal renderowala sie „poprawnie”.

## 6. Lista defektow

Priorytety: **blokujacy** (wstrzymuje odbior), **powazny** (do naprawy przed
produkcja), **drobny** (dlug techniczny).

### BLK-1 — blokujacy — zestaw testow moze celowac w projekt HOSTOWANY

**Wlasciciel: E2** (`tests/integration/helpers/supabase.ts`)

`stackEnv()` czyta zmienne w kolejnosci:

```ts
apiUrl:         process.env.SUPABASE_URL              ?? process.env.API_URL
anonKey:        process.env.SUPABASE_ANON_KEY         ?? process.env.ANON_KEY
serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY
```

Jesli w srodowisku powloki sa ustawione `SUPABASE_*` wskazujace na projekt
hostowany (`https://<ref>.supabase.co`) — a na maszynie, na ktorej powstal ten
raport, byly — to **one maja pierwszenstwo** nad parametrami lokalnego stacku
z `supabase status`. Skutek: `npm run test:integration` oraz `npm run test:e2e`
celuja w zdalna baze, razem z zapisami kluczem `service_role`
(`createTraining`, `createInquiry`, `grantAdmin`) oraz `clearThrottle()`, ktory
**kasuje wiersze** z `form_submission_throttle`, i `withPg()` po `DB_URL`.

Bramka hermetycznosci dodana w tym etapie zatrzymala przebieg przed pierwszym
zapytaniem, wiec zaden zdalny projekt nie zostal dotkniety.

Naprawa: (1) odwrocic pierwszenstwo — lokalne `API_URL`/`ANON_KEY`/
`SERVICE_ROLE_KEY` wygrywaja, `SUPABASE_*` tylko jako jawny opt-in;
(2) wywolac `assertLocalStack()` rowniez z `tests/integration/helpers/global-setup.ts`
— dzisiaj chroniony jest wylacznie zestaw E2E.

### BLK-2 — blokujacy (naprawione na tym branchu) — scalenie skasowalo frontend E3

**Wlasciciel: integracja (E6) — naprawione, do pilnowania przy merge do `main`**

W poprzednim scaleniu branchy E1–E5 w `qa/isk-348-e2e` konflikty w trzech
plikach rozstrzygnieto na rzecz E5, co skasowalo publiczny frontend E3:

| Plik | Stan po blednym scaleniu | Stan wlasciwy (E3) |
| --- | --- | --- |
| `app/page.tsx` | placeholder „Fundament aplikacji jest gotowy…” | strona glowna z sekcjami i linkami do katalogu |
| `app/szkolenia/page.tsx` | `h1 „Szkolenia”`, lista bez filtra i bez wyszukiwania | `h1 „Znajdz szkolenie…”`, formularz filtra + szukania, `TrainingCard` |
| `app/trenerzy/page.tsx` | `h1 „Trenerzy”`, minimalna lista | `h1 „Ekspertki i eksperci…”` |

Najwazniejsze: **katalog nie mial w ogole filtra po kategorii ani wyszukiwania**,
wiec sciezka D5.1 byla niewykonalna, a testy opisujace ja jako „zielona” w
poprzednich przebiegach opieraly sie na nieistniejacym UI. Przywrocono wersje
E3 (`app/page.tsx`, `app/szkolenia/page.tsx`, `app/trenerzy/page.tsx`); reszta
dorobku E3 (`[slug]`, `components/`, `lib/public-catalog.ts`, `lib/seo.ts`,
`globals.css`) przetrwala scalenie bez zmian.

`/kontakt` zostaje w wersji E4 — ta strona hostuje formularz i E4 jest jej
wlascicielem. Stad naglowek „Zapytaj o szkolenie”, a nie „Porozmawiajmy”.

### POW-1 — powazny — panel renderuje sie wewnatrz publicznego layoutu

**Wlasciciel: E5**

`app/panel/(admin)/layout.tsx` jest zagniezdzony w `app/layout.tsx`, ktory
renderuje `<SiteHeader />` i `<SiteFooter />`. Kazda strona panelu ma wiec:

- **dwa landmarki `banner`** (publiczny naglowek + naglowek panelu),
- dwie nawigacje (`Glowna nawigacja` i `Nawigacja panelu`),
- publiczna stopke z linkami marketingowymi,
- `<main>` panelu wewnatrz publicznej powloki.

Dowod — zrzut drzewa dostepnosci z `/panel/szkolenia`:

```yaml
- banner:                      # publiczny
  - navigation "Główna nawigacja"
- banner:                      # panelu
  - navigation "Nawigacja panelu"
- main:
  - heading "Szkolenia" [level=1]
```

Konsekwencje: zdublowane landmarki laduja w nawigacji czytnika ekranu
(WCAG 1.3.1), administrator dostaje marketingowe linki w narzedziu roboczym,
a Tab przechodzi najpierw cala publiczna nawigacje. Naprawa: wlasna grupa tras
z osobnym `layout.tsx` dla panelu (route group bez publicznej powloki).

### POW-2 — powazny (naprawione) — `panel.spec.ts` byl niestabilny przy rownoleglosci

**Wlasciciel: E5 (do wiadomosci) — poprawka w tym PR**

`panel.spec.ts` siegal po `getByRole("link", { name: "Edytuj" }).first()` oraz
`getByRole("link", { name: "Zobacz szczegoly" }).first()`, czyli po *pierwszy
wiersz tabeli*. Przy `fullyParallel: true` inne pliki wstawiaja i usuwaja swoje
szkolenia, wiec klikniecie trafialo w obcy — czasem juz usuniety — rekord.

Objaw jest podstepny: **test przechodzil w izolacji (5/5, 30 s) i padal w pelnym
przebiegu**, co czyta sie jak blad aplikacji, a nie jak blad selektora.
Poprawiono na selektory zakotwiczone we wlasnym wierszu
(`getByRole("row").filter({ hasText: … })`).

### POW-3 — powazny (naprawione) — zadanie `e2e` w CI buduje aplikacje, a testowalo serwer dev

**Wlasciciel: E1** (`.github/workflows/ci.yml`) — poprawka w tym PR

Zadanie `e2e` wykonuje `npm run build`, ale `playwright.config.ts` startuje
`npm run dev`, dopoki nie jest ustawione `PLAYWRIGHT_USE_BUILD`. Artefakt builda
jest wiec nieuzywany, a bramka E2E testuje kod w trybie deweloperskim — inny
niz produkcyjny (brak optymalizacji, inne zachowanie cache i ISR, kompilacja na
zadanie wydluzajaca kazdy pierwszy request). ADR-0005 D2 zaklada, ze `e2e`
„korzysta z artefaktu builda”.

To nie bylo tylko marnotrawstwo. W trybie dev kazda nieskompilowana trasa
kompiluje sie na zadanie, a przy kilku workerach rownoczesne wejscia w trasy
panelu konczyly sie `net::ERR_ABORTED` i przerwanymi nawigacjami. Objaw czytal
sie jak blad aplikacji, choc aplikacja byla sprawna — te same testy przechodzily
uruchomione pojedynczo.

Pomiar tej samej, niezmienionej wersji kodu i testow:

| Tryb serwera | Wynik | Czas |
| --- | --- | --- |
| `npm run dev` (stan wyjsciowy) | 5 niepowodzen / 50 | 1,8 min |
| `npm run start` (`PLAYWRIGHT_USE_BUILD=1`) | 0 niepowodzen poza POW-4 | **18,9 s** |

Naprawione: zadanie `e2e` ma teraz `PLAYWRIGHT_USE_BUILD: "1"`, czyli testuje
artefakt builda zrobionego krok wczesniej — zgodnie z ADR-0005 D2. Ubocznie
bramka E2E jest ~6x szybsza i przestala byc niestabilna.

### POW-4 — powazny — kontrast ponizej AA w tabelach panelu (WCAG 1.4.3)

**Wlasciciel: E5**

`th` oraz `td small` w tabelach panelu uzywaja `--color-text-muted`
(`#7e857a`). Na bialym tle daje to **~3.8:1**, a WCAG 2.1 AA wymaga **4.5:1**
dla tekstu tej wielkosci (`th` ma dodatkowo `font-size: var(--text-xs)`).
Dotyczy naglowkow kolumn (NAZWA / KATEGORIA / STATUS / AKCJE) i slugow
wyswietlanych pod nazwa pozycji.

Wykryte przez `@axe-core/playwright` (regula `color-contrast`, waga *serious*)
na `/panel/szkolenia`, `/panel/trenerzy` i `/panel/zgloszenia`. Widoki publiczne
sa czyste — defekt dotyczy wylacznie panelu.

Naprawa: `--color-text-secondary` (`#5b6157`) daje ~6.4:1 i miesci sie
w istniejacej palecie — nie trzeba dobierac nowego koloru.

Te trzy przypadki sa w zestawie oznaczone `test.fail()` z odwolaniem do tego
defektu, a nie pominiete: bramka jest zielona, defekt zostaje widoczny w kodzie,
a po naprawie kontrastu Playwright zglosi „expected to fail but passed”
i wymusi zdjecie adnotacji.

**Pulapka przy tej konstrukcji — warta zapamietania.** Naruszenie kontrastu
istnieje tylko wtedy, gdy tabela ma wiersze: pusta lista nie renderuje ani
`th`, ani `td small`. Seed `[DEMO]` nie zawiera zadnych zgloszen, wiec na
swiezej bazie `/panel/zgloszenia` przechodzil skan — i to `test.fail()`
stawal sie czerwony („expected to fail, but passed”). Bramka byla zielona
lokalnie, gdzie zgloszenia zostawaly po wczesniejszych testach, a czerwona
w CI. Test zaklada teraz wlasne zgloszenie w `beforeAll` i przed skanem
sprawdza, ze tabela ma co najmniej jeden wiersz — skan pustej tabeli i tak
niczego by nie dowodzil.

Przy okazji wyszlo, ze helper `createInquiry()` w `tests/e2e/helpers/data.ts`
nigdy wczesniej nie byl wywolany i lamal CHECK `inquiries_has_subject`
(brakowalo `interest_area`). Poprawione.

**Dlaczego ten defekt nie zostalby znalezany w zakresie z ADR-0005 D4:** lista
siedmiu widokow do skanu nie obejmuje panelu. Skan panelu dodalem ponad
wymagane minimum.

### POW-5 — powazny — trzecia sekcja nawigacji panelu wychodzi za ekran przy 360 px

**Wlasciciel: E5**

Zmierzone na `/panel/szkolenia` i `/panel/zgloszenia` przy szerokosci 360 px:

```
nav[aria-label="Nawigacja panelu"] — ostatni link „Zgloszenia”
  prawa krawedz: 403 px     viewport: 360 px     → wychodzi o 43 px
  overflow-x nawigacji: auto (element przewija sie w poziomie)
```

Link **jest** osiagalny, bo nawigacja przewija sie w poziomie, ale nie ma
zadnej wizualnej wskazowki, ze cos jest dalej — na telefonie jedna z trzech
sekcji panelu wyglada na nieistniejaca. Naprawa: zawijanie (`flex-wrap`),
krotsze etykiety albo widoczny afordans przewijania.

Tabele panelu zachowuja sie poprawnie: `.panel-table-wrap` ma
`overflow-x: auto` i faktycznie przewija (`scrollWidth` 490-590 px przy
viewporcie 360 px), czyli ukryte kolumny sa dostepne — to przyjety wzorzec
tabeli responsywnej, nie defekt.

**Ograniczenie wlasnej asercji (swiadome).** Test RWD sprawdza
`documentElement.scrollWidth <= window.innerWidth`, czyli brak przewijania
*calej strony*. Przyciecie wewnatrz kontenera z `overflow-x: auto` jest dla
tej asercji niewidoczne — i slusznie, bo strona faktycznie sie nie rozjezdza.
POW-5 znalazlem pomiarem geometrii elementow nawigacji, nie ta asercja.
Zrzuty ekranu same w sobie rowniez nie sa asercja; sluza przegladowi.

### DRB-1 — drobny (naprawione) — sonda debugowa w repozytorium

`tests/e2e/tmp-probe.spec.ts` byla pozostawiona sonda diagnostyczna: bez ani
jednej asercji, z `console.log` ciala odpowiedzi API i `waitForTimeout(3000)`.
Zawsze „zielona”, wiec nie dawala sygnalu, a wydluzala przebieg. Usunieta.

### DRB-2 — drobny (naprawione) — trzykrotny skan axe tej samej strony

Skany axe byly rozrzucone po `home.spec.ts`, `kontakt.spec.ts` i
`public-pages.spec.ts`; `/` byla skanowana trzy razy, `/kontakt` dwa.
Skonsolidowane w `dostepnosc.spec.ts`. Usuniete `home.spec.ts` (smoke E1, w
calosci zawarty w `public-pages.spec.ts` + `dostepnosc.spec.ts`) i
`kontakt.spec.ts` (E4 — patrz DRB-3).

### DRB-3 — drobny (naprawione) — `kontakt.spec.ts` dzielil licznik antyspamowy

`kontakt.spec.ts` (E4) wysylal zgloszenia na **staly** adres
`e2e-osoba@example.invalid` i czekal `waitForTimeout(3500)`, nie czyszczac przy
tym licznika limitu czestosci. Przy limicie 3 przyjetych zgloszen / 10 min na
klienta kazdy kolejny przebieg w tym oknie konkurowal o te same 3 sloty z
`formularz-zgloszenia.spec.ts`. Testy duplikowaly sciezki D5.3 i D5.5, wiec
plik usunieto, a skan axe formularza przeniesiono do `dostepnosc.spec.ts`.

## 7. Wyniki przebiegow

Wszystko na lokalnym stacku Supabase CLI (`qa-isk348`, porty przesuniete na
54360+), po `supabase db reset` ze swiezym seedem, `MAIL_TRANSPORT=log`.

| Bramka | Komenda | Wynik |
| --- | --- | --- |
| Lint | `npm run lint` | zielone (`--max-warnings=0`) |
| Typy | `npm run typecheck` | zielone (po `rm -rf .next tsconfig.tsbuildinfo`) |
| Build | `npm run build` | zielone |
| Testy jednostkowe | `npm run test:unit` | **93 testy / 18 plikow — zielone** |
| Testy integracyjne | `./scripts/integration-local.sh` | **24 testy / 6 plikow — zielone** (16 wymaganych przypadkow RLS) |
| E2E + axe | `PLAYWRIGHT_USE_BUILD=1 ./scripts/e2e-local.sh` | **52 testy — zielone, 15,7 s** (w tym 3 udokumentowane `test.fail()` dla POW-4; 21 dowodow RWD pominietych bez `EVIDENCE_DIR`) |
| Dowody RWD | `EVIDENCE_DIR=… …/visual-evidence.spec.ts` | **21 testow — zielone, 30 zrzutow** |

Zestaw ma lacznie **73 testy w 8 plikach**. Przebieg weryfikacyjny wykonany
po `supabase db reset`, czyli w tych samych warunkach co CI — swieza baza
z samym seedem `[DEMO]`, bez danych pozostawionych przez wczesniejsze testy.

Typecheck uruchamiany po usunieciu `.tsbuildinfo` i `.next` swiadomie:
`tsconfig.json` ma `incremental: true`, wiec nieaktualny cache potrafi dac
zielony typecheck lokalnie i czerwony w CI.

Dowody RWD generowane po `rm -rf .next/cache`. Bez tego cache danych ISR
przezywa `supabase db reset` i zrzuty pokazuja nieaktualne dane (podczas
przygotowania raportu jedna skasowana kategoria byla nadal widoczna na
zrzucie — artefakt cache, nie stan bazy).

## 8. Luki w pokryciu

Zgodnie z ADR-0005 D7 obowiazuje lista, nie prog procentowy.

**Luki wzgledem listy obowiazkowej: brak.** Wszystkie 9 sciezek z D5 i wszystkie
16 przypadkow RLS z `model-danych.md` §5 maja faktyczny test.

Luki zamkniete w tym etapie (wczesniej nie istnialy):

| Luka | Zamkniecie |
| --- | --- |
| D5.1 nie istniala jako jedno przejscie — byly tylko testy per-widok | `katalog-sciezka.spec.ts` |
| D5.7 nie obejmowala **tworzenia** szkolenia przez formularz panelu | `panel-katalog.spec.ts` |
| Brak skanu axe widoku logowania (7. wymagany widok) | `dostepnosc.spec.ts` |
| Brak skanu axe formularza w stanie bledu walidacji | `dostepnosc.spec.ts` |
| Brak testow nawigacji klawiatura, widocznosci focusu, pulapki focusu | `dostepnosc.spec.ts` |
| Brak testu hierarchii naglowkow | `dostepnosc.spec.ts` (7 widokow) |
| Brak testu `alt` przy `trainers.photo_url = NULL` | `dostepnosc.spec.ts` |
| Dowody RWD obejmowaly tylko widoki publiczne, bez panelu | `visual-evidence.spec.ts` |
| Bramka hermetycznosci istniala w imporcie, ale nie w kodzie | `tests/e2e/helpers/stack.ts` + `globalSetup` |

Swiadomie **niepokryte** (poza zakresem E6 albo niewykonalne lokalnie):

| Obszar | Dlaczego |
| --- | --- |
| Realna wysylka przez Resend | Klucz jest bramka ISKT; ADR-0005 D7 wymaga `MAIL_TRANSPORT=log`. Pokryte jednostkowo (`mail-resend.test.ts`) na zamockowanym transporcie. |
| Cloudflare Turnstile | Domyslnie wylaczony, wlaczenie wymaga decyzji ISKT (nowy procesor danych). |
| Testy na realnych przegladarkach mobilnych i czytnikach ekranu (NVDA/VoiceOver) | Wymaga urzadzen i rak; RWD pokryte emulacja viewportu, dostepnosc — axe plus testy klawiatury. |
| Wydajnosc (Lighthouse / Core Web Vitals) | Nie w zakresie DoD E6. |
| Przeglad tresci i finalne teksty | Bramka tresci ISKT; dane sa `[DEMO]`. |
| Konfiguracja branch protection na `main` | Wymaga uprawnien wlasciciela repozytorium (ADR-0005 D3, otwarty punkt dla ISKT). |

## 9. Werdykt

**Bramka jakosci: PRZESZLA WARUNKOWO.**

Wszystkie wymagania ilosciowe DoD sa spelnione: 9 sciezek krytycznych
zaimplementowanych i zielonych, 7 widokow przeskanowanych axe bez naruszen
krytycznych i powaznych, nawigacja klawiatura potwierdzona testami, RWD
udokumentowane 30 zrzutami w trzech szerokosciach, kompletne pokrycie listy
obowiazkowej RLS.

Warunek dotyczy dwoch defektow blokujacych:

1. **BLK-1 nie jest naprawiony** i nalezy do E2. Dopoki pierwszenstwo zmiennych
   w `stackEnv()` pozostaje odwrocone, kazdy przebieg testow na maszynie
   z ustawionymi `SUPABASE_*` moze celowac w projekt hostowany — razem
   z zapisami i usuwaniem danych kluczem `service_role`. Obejscie
   (`scripts/*-local.sh` + bramka hermetycznosci w `globalSetup` E2E) chroni
   zestaw E2E, ale **nie** chroni `npm run test:integration` uruchomionego
   bezposrednio.
2. **BLK-2 jest naprawiony na tym branchu**, ale jest ostrzezeniem
   proceduralnym: scalenie do `main` musi zachowac publiczny frontend E3.
   Rekomendacja — przed merge sprawdzic, ze `/szkolenia` ma formularz filtra
   i wyszukiwania, bo wlasnie ten element zniknal po cichu, a zestaw testow
   nadal raportowal sukces.

Defekty POW-1, POW-4 i POW-5 (panel: zagniezdzony layout, kontrast ponizej AA,
nawigacja wychodzaca za ekran przy 360 px) nie blokuja odbioru etapu, ale
powinny zostac naprawione przed produkcja — sa po stronie E5.

Do odbioru przez ISKT pozostaja bramki niezalezne od QA: tresci finalne,
klauzula RODO (obecnie placeholder `draft-2026-10`), konto administratora,
klucz Resend i branch protection na `main`.
