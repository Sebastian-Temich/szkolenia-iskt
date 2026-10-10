# ISK-359 — naprawa trzech defektow powaznych z raportu QA E6

Dotyczy POW-1, POW-4 i POW-5 z `docs/qa/raport-e6.md` (bramka QA E6, ISK-348).
Galaz `fix/isk-359-panel-layout-a11y`, wychodzi z `qa/isk-348-e2e` — czyli
z tego samego drzewa, na ktorym QA zmierzylo defekty.

| Defekt | Czego dotyczy                                   | Stan       |
| ------ | ----------------------------------------------- | ---------- |
| POW-1  | panel wewnatrz publicznego layoutu              | naprawiony |
| POW-4  | kontrast tabel panelu ponizej AA                | naprawiony |
| POW-5  | trzecia sekcja nawigacji za ekranem przy 360 px | naprawiony |

## POW-1 — panel ma wlasna powloke

`app/layout.tsx` renderowal `<SiteHeader />` i `<SiteFooter />`, a
`app/panel/(admin)/layout.tsx` jest w nim zagniezdzony — kazdy widok panelu
mial wiec dwa landmarki `banner`, dwie nawigacje i marketingowa stopke
(WCAG 1.3.1).

Naglowek i stopka publiczna przeniosly sie do nowej grupy tras
`app/(public)/layout.tsx`. `app/layout.tsx` zostaje z samym `<html>`,
`<body>` i arkuszem globalnym. Panel — razem z `/panel/logowanie`
i `/panel/brak-dostepu` — nie dziedziczy juz publicznej powloki.

Grupa tras nie zmienia adresow URL. Potwierdza to tablica tras z
`next build`: `/`, `/kontakt`, `/szkolenia`, `/szkolenia/[slug]`, `/trenerzy`
bez zadnego prefiksu `(public)`.

Drzewo dostepnosci `/panel/logowanie` po naprawie (z przebiegu Playwrighta —
brak `banner`, brak `contentinfo`):

```yaml
- main:
    - region "Zaloguj się":
        - paragraph: Panel administratora
        - heading "Zaloguj się" [level=1]
```

## POW-4 — kontrast AA w tabelach panelu

`th`, `td small` i `.panel-card dt` byly malowane `--color-text-muted`
(`#7e857a`): ~3,8:1 na bialym tle, przy wymaganych 4,5:1. `th` jest dodatkowo
w `--text-xs`, wiec AA liczy go jako tekst zwykly, nie duzy.

Wszystkie trzy przechodza na `--color-text-secondary` (`#5b6157`, ~6,4:1) —
kolor jest w palecie od E1, nowego nie dobieramy. `.panel-card dt` nie bylo
w raporcie (skan axe obejmowal widoki listowe, nie szczegolu), ale to ten sam
defekt w tym samym module; zostawienie go przy 3,8:1 obok naprawionego `th`
bylo niespojne.

Reszta uzyc `--color-text-muted` (widoki publiczne) zostaje bez zmian —
raport potwierdza, ze sa czyste.

## POW-5 — nawigacja panelu przy 360 px

`.panel-header nav` mial przy `max-width: 48rem` `overflow-x: auto`. Przy
360 px link „Zgloszenia” konczyl sie na **403 px**, czyli 43 px za prawa
krawedzia ekranu. Byl osiagalny przewijaniem nawigacji, ale bez zadnego
afordansu — jedna z trzech sekcji panelu wygladala na nieistniejaca.

Nawigacja zawija sie teraz (`flex-wrap: wrap` + `row-gap`) zamiast przewijac.
Kazda sekcja jest widoczna w obrebie ekranu i osiagalna Tabem, bez
dodatkowego widgetu rozwijania.

Tabel panelu nie ruszamy: `.panel-table-wrap` ma `overflow-x: auto`
i faktycznie przewija — raport uznaje to za przyjety wzorzec, nie defekt.

## Zdjecie adnotacji `test.fail()`

Trzy przypadki panelu w `tests/e2e/dostepnosc.spec.ts` byly oznaczone
`test.fail()` z odwolaniem do POW-4. Adnotacja jest zdjeta — po naprawie
kontrastu te przypadki przechodza normalnie. Bez tego Playwright zglosilby
„expected to fail but passed”, a bramka pilnowalaby defektu, ktorego nie ma.

Flaga zostaje, pod nazwa `hasTable`, bo pilnuje czegos innego i nadal
realnego: skan pustej tabeli nie renderuje ani `th`, ani `td small`, wiec
przeszedlby bez sprawdzenia kontrastu, ktorego dotyczy.

## Regresja

Nowy `tests/e2e/panel-layout.spec.ts` — 8 przypadkow dla POW-1 i POW-5.
Mierzy **geometrie linkow nawigacji**, a nie przewijanie dokumentu: asercja
„dokument nie przewija sie w bok” z `visual-evidence.spec.ts` byla przy POW-5
zielona, bo przewijala sie sama nawigacja, nie dokument.

Plik dziala w trybie `serial` z jedna sesja na caly plik. Powod: GoTrue ma
`sign_in_sign_ups = 30` na 5 minut na adres IP, a zestaw E2E byl juz blisko
progu — osiem dodatkowych logowan przez UI przepychalo go ponad i testy
czerwienily sie na limicie, nie na defekcie. Samego logowania pilnuje
`panel-dostep.spec.ts`. Koszt: pierwsza porazka zasłania kolejne przypadki
w pliku.

## Dowody

### Bramki statyczne

| Bramka              | Wynik                          |
| ------------------- | ------------------------------ |
| `npm run lint`      | zielona                        |
| `npm run typecheck` | zielona                        |
| `npm run build`     | zielona, URL-e bez zmian       |
| `npm run test:unit` | 93 testy, 18 plikow            |
| `prettier --check`  | zielona na zmienionych plikach |

`typecheck` wymaga swiezego `.next/types` — po przeniesieniu tras do grupy
`(public)` stare wygenerowane typy wskazuja na nieistniejace sciezki
i `tsc` zglasza TS2307. Kolejnosc jest wiec `build`, potem `typecheck`
(tak jak w CI, gdzie katalog jest czysty).

### E2E z axe i RWD

Pelny zestaw, przebieg rozstrzygajacy: **81 passed / 81, zero flak**,
30 zrzutow RWD w trzech szerokosciach (360/768/1280) dla szesciu widokow
publicznych i czterech widokow panelu.

```
Running 81 tests using 7 workers
  81 passed (42.3s)
```

Testy RWD pomijaja sie bez `EVIDENCE_DIR`, wiec przebieg dowodowy ustawia te
zmienna — inaczej tally jest zielone, a RWD nieprzebadane. Liczba zrzutow
(30) jest sprawdzana po przebiegu, zeby „zielone” nie oznaczalo „pominiete”.

Cztery skany axe panelu (`/panel`, `/panel/szkolenia`, `/panel/trenerzy`,
`/panel/zgloszenia`) przechodza **bez adnotacji** `test.fail()`.

### Kontrola negatywna

Same zielone testy nie dowodza niczego, dopoki nie pokaza czerwonego na
niezaprawionym kodzie. Naprawa zostala cofniela w drzewie roboczym,
aplikacja przebudowana, testy uruchomione ponownie:

- **POW-1** — `getByRole('banner')` zwraca **2 elementy** zamiast 1 na
  `/panel`.
- **POW-4** — `color-contrast (serious)` na trzech widokach tabel, wezly
  `th:nth-child(1..4)` oraz `td > small`; `/panel` (bez tabeli) zielony,
  czyli naruszenie pochodzi z tabeli, nie z powloki.
- **POW-5** — `link "Zgłoszenia" wychodzi za prawa krawedz ekranu`,
  zmierzone **403 px** przy viewportcie 360 px. Zgadza sie co do piksela
  z pomiarem z raportu QA.

Po przywroceniu naprawy i przebudowie wszystkie te przypadki sa zielone.

### Jak powtorzyc

```bash
# bramki statyczne (kolejnosc ma znaczenie, patrz wyzej)
npm run lint && npm run build && npm run typecheck && npm run test:unit

# E2E z axe i dowodami RWD
PLAYWRIGHT_USE_BUILD=1 EVIDENCE_DIR=/tmp/isk359-rwd \
  SUPABASE_DIR=<katalog ze stackiem> ./scripts/e2e-local.sh
```

## Uwagi do przebiegu

Przebieg dowodowy szedl przeciwko dzialajacemu lokalnemu stackowi
`qa-isk348` — te same migracje i seed co na tej galezi. VM Dockera (7,6 GiB)
hostuje stacki kilku rownoleglych przebiegow i miala ~100 MB wolnej pamieci,
wiec podniesienie wlasnego stacku konczylo sie timeoutem Postgresa. Wspolny
stack ma koszt: przy kilku przebiegach pod rzad (kontrole negatywne robia
kilka pod rzad) wchodzi limit logowan GoTrue i sporadyczne HTTP 500
z PostgREST pod obciazeniem pamieciowym. W jednym z przebiegow dalo to
8 flak — wszystkie zielone po retry, zadna nie dotyczyla naprawianych
defektow. Po odczekaniu okna 5 minut przebieg jest czysty: 81/81 bez retry.
Na wyniki z tej maszyny trzeba patrzec przez ten filtr; rozstrzygajacy jest
przebieg CI na swiezym stacku.
