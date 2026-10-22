# ISK-403 — korekta pomiaru (czytaj PRZED uzyciem plikow `pomiary/focus-*.json`)

Pliki `pomiary/focus-*.json` oraz pola `maleCele` w `pomiary/*.json` pochodza z
PIERWSZEJ, WADLIWEJ wersji helpera. Ponizsze wartosci sa **uniewaznione**.

## 1. `maPierscien: false` na polach formularzy — ARTEFAKT POMIARU, nie defekt

Dotyczy 17 rekordow: `focus-kontakt.json` (12), `focus-landing.json` (3),
`focus-katalog.json` (2) — wszystkie z `kolorPierscienia: "<brak>"`.

`.ui-field-control` ma `transition: box-shadow 130ms`, a pierscien pol
formularza siedzi wlasnie w `box-shadow`. Helper czytal `getComputedStyle`
w TEJ SAMEJ ramce, w ktorej padl `Tab`, czyli lapal pierwsza klatke przejscia:
`oklab(0 0 0 / 0) 0px 0px 0px 0px` — alfa 0 i grubosc 0. Do tego regexp kolorow
nie znal `oklab()`, wiec kolor wychodzil pusty i rekord dostawal `"<brak>"`.

Pomiar izolowany na SKOMPILOWANYM CSS (`.next/static/css/62450834853625fa.css`):

| moment odczytu | `box-shadow` na `input.ui-field-control` |
| --- | --- |
| 0 ms (stara wersja) | `oklab(0 0 0 / 0) 0px 0px 0px 0px` |
| 250 ms (po przejsciu) | `color(srgb 0.329 0.518 0.114 / 0.55) 0px 0px 0px 3px` |

**Wniosek: kazdy element ma widoczny pierscien focusu. Nie ma defektu
"pola bez focusu".** Helper poprawiony (odczekanie 220 ms + `oklab` w regexpie).

## 2. `input#company_website` na liscie malych celow — ARTEFAKT, nie defekt

To honeypot z ADR-0004 §3: `aria-hidden="true"`, `tabindex="-1"`,
`left:-9999px`. Nie jest celem dotykowym zadnego uzytkownika. Filtr helpera
poprawiony; pozostale pozycje listy malych celow sa prawdziwe.

## 3. `span.home-hero-glow-b` poza viewportem @1440 — ZGODNOSC ZE WZORCEM

`.home-hero` ma `overflow: hidden`, a poswiata ma `pointer-events: none` —
nie powoduje przewijania. Geometria jest IDENTYCZNA jak we wzorcu:

| | selektor | right | width | left | naddatek |
| --- | --- | --- | --- | --- | --- |
| produkt | `span.home-hero-glow-b` | 1600 | 480 | 1120 | 160 |
| wzorzec | `div > main > section > div` | 1600 | 480 | 1120 | 160 |

## 4. Co pozostaje WAZNE i niezmienione

Kontrast pierscienia focusu (1.45–2.11 : 1) zostal potwierdzony niezaleznie
pomiarem izolowanym na skompilowanym CSS i **jest prawdziwym blokerem**.
