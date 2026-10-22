# Tokeny design systemu ISKT

Źródłem jest lokalny materiał referencyjny `ISKT Greenovation Design System`, katalog `_ds/tokens/*.css`. Materiał został potraktowany wyłącznie jako wzorzec; aplikacja nie kopiuje referencyjnego HTML ani nie ładuje skryptów z materiału wejściowego.

Tokeny są zdefiniowane w [`app/globals.css`](../app/globals.css) w bloku Tailwind CSS v4 `@theme`. Dzięki temu są dostępne jednocześnie jako zmienne CSS i klasy użytkowe Tailwind.

| Grupa            | Przykładowa zmienna CSS                      | Przykładowa klasa Tailwind      |
| ---------------- | -------------------------------------------- | ------------------------------- |
| kolory marki     | `--color-green-700`                          | `bg-green-700`                  |
| role semantyczne | `--color-text-primary`                       | `text-text-primary`             |
| typografia       | `--font-sans`, `--text-4xl`                  | `font-sans`, `text-4xl`         |
| odstępy i layout | `--spacing-section`, `--container-container` | `py-section`, `max-w-container` |
| promienie        | `--radius-md`                                | `rounded-md`                    |
| cienie           | `--shadow-brand`                             | `shadow-brand`                  |
| animacja         | `--ease-standard`                            | `ease-standard`                 |

Fonty mają bezpieczne stosy systemowe. Nie pobieramy Google Fonts ani w runtime, ani w czasie builda, dzięki czemu build i testy E2E pozostają hermetyczne i nie korzystają z publicznej sieci.

## Krój pisma

Podstawowym krojem jest **Inter** w wariancie zmiennym (oś `wght` 100–900), wczytywany przez `next/font/local` z pliku w repozytorium:

- plik: [`app/fonts/InterVariable.woff2`](../app/fonts/InterVariable.woff2) (pełny zestaw łaciński, w tym polskie znaki diakrytyczne),
- konfiguracja: [`app/fonts/index.ts`](../app/fonts/index.ts),
- licencja: SIL Open Font License 1.1 — [`app/fonts/LICENSE-Inter.txt`](../app/fonts/LICENSE-Inter.txt).

Świadomie **nie** używamy `next/font/google`: ten wariant pobiera plik z CDN w czasie builda, co złamałoby hermetyczność opisaną wyżej i dodałoby dostawcę do [`docs/zgodnosc/procesorzy.md`](zgodnosc/procesorzy.md). Wariant lokalny nie wymaga sieci na żadnym etapie.

Rodzina wygenerowana przez `next/font` trafia do `--font-inter` (klasa na `<html>` w `app/layout.tsx`), a `--font-sans` wskazuje ją jako pierwszą pozycję stosu. Przed ISK-364 `--font-sans` zaczynało się od nazwy `Inter`, której nikt nie wczytywał — cała aplikacja renderowała się krojem systemowym.

## Skala nagłówków

Preflight Tailwinda v4 zeruje `font-size` i `font-weight` nagłówków. Bazowa skala `h1`–`h6` siedzi w `@layer base` w `app/globals.css` i opiera się na tokenach `--text-*`. Leży **poniżej** warstw `components` i `utilities`, więc reguły komponentowe (`.page-hero h1`, `.prose h2`) i klasy użytkowe (`text-3xl`) nadal mają pierwszeństwo — baza obsługuje widoki, które nie deklarują nic własnego.

Bez tej reguły każdy nagłówek bez jawnego `text-*`/`font-*` renderuje się jako 16px/400, czyli nieodróżnialnie od tekstu akapitowego (ISK-364 / B2).

## Tokeny rytmu i formy (ISK-400)

Tokeny kompozycji wzorca ISKT Greenovation leżą w `app/globals.css` w bloku **`:root`**, a nie w `@theme`:

| Token                                                       | Wartość                      | Uwaga                                           |
| ----------------------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| `--section-pad-y`                                           | `clamp(4rem, 9vw, 7.5rem)`   | 64 / 69 / 120 px przy 360 / 768 / 1440          |
| `--container-max`                                           | `75rem` (1200 px)            |                                                 |
| `--container-pad`                                           | `clamp(1.25rem, 5vw, 3rem)`  | 20 / 38,4 / 48 px                               |
| `--radius-card` / `--radius-panel` / `--radius-control`     | 16 / 32 / 12 px              | aliasy na `--radius-lg/2xl/md`                  |
| `--control-h-sm/md/lg/xl`                                   | 44 / 46 / 54 / 56 px         | `sm` = minimum celu dotykowego                  |
| `--field-h`                                                 | 46 px                        |                                                 |
| `--focus-ring`, `--focus-ring-width`, `--focus-ring-offset` | `color-mix(...)`, 3 px, 2 px |                                                 |
| `--dur-fast/base/slow`                                      | 130 / 220 / 380 ms           |                                                 |
| `--gradient-brand/leaf/wash`                                | gradienty marki              | `brand` = `120deg`, green-500 → 700 (60%) → 900 |
| `--border-width-brand`                                      | `1.5px`                      | patrz niżej                                     |

**Dlaczego `:root`, a nie `@theme`.** Tailwind v4 czyta nazwy z `@theme` jako przestrzenie utilities, a nazwa wpisana w taką przestrzeń może **przesłonić wbudowaną klasę**. Tokeny wzorca nazywają się `--container-max` i `--container-pad`; w `@theme` wygenerowałyby `max-w-max` i `max-w-pad`, a `max-w-max` (`max-width: max-content`) Tailwind definiuje sam. Projekt stracił już raz cały układ strony na `--spacing-container` przesłaniającym `max-w-container` (ISK-355). Zwykłe właściwości w `:root` nie generują żadnego utility, więc kolizja jest niemożliwa z definicji, a nazwy mogą być identyczne z `_ds/tokens/*.css`. Konsumentem tych tokenów jest `@layer components`, nie klasy użytkowe.

Brak kolizji jest **mierzony**, nie założony: `tests/e2e/fundament-ui.spec.ts` sprawdza, że po dodaniu tokenów `max-w-max` dalej daje `max-content`, a `max-w-container` dalej 1200 px.

**`--border-width-brand: 1.5px` — zmierzony fakt platformy.** Wzorzec daje krawędź 1,5 px przyciskom ghost i pigułkom, a 1 px przyciskom primary. Blink podłogowuje szerokość krawędzi do pełnego piksela CSS (minimum 1 px), **niezależnie od `deviceScaleFactor`** — sprawdzone osobno przy DPR 2. W Chromium ghost i primary mają więc identyczną krawędź 1 px i zamysł wzorca nie jest zrealizowany. Token zostaje przy wartości wzorca (Firefox i Safari ją honorują); pytanie, czy krawędź marki ma być 2 px (`--border-width-strong`), jest decyzją projektową dla bramki UX, nie dla fundamentu. Fakt jest zapisany jako test, żeby nie zginął.

## Warstwa komponentów (ISK-400)

Moduły w `components/ui/`, jedno wejście: `import { Button, Card } from "@/components/ui"`. Styl siedzi w `@layer components` w `app/globals.css` pod prefiksem **`ui-`**; w `.tsx` jest tylko struktura, semantyka i dostępność.

**Dlaczego prefiks `ui-`.** W `globals.css` żyją już dwa niezależne zestawy klas — publiczny (`.button`, `.pill`, `.card-footer`, `.section-heading`) i panelu (`.panel-*`) — oba w `@layer components`, czyli o tej samej wadze. Klasa `.card` czy `.badge` bez prefiksu trafiłaby w ich sąsiedztwo i pierwsza kolizja objawiłaby się jako „layout się rozjechał” bez żadnego błędu. Prefiks jest granicą: M2 i M3 podmieniają widoki po jednym, nie jednym skokiem.

| Komponent                                       | Props                                                                                                                                   | Uwagi                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Button`                                        | `variant` `primary\|ghost\|light\|neutral`, `size` `sm\|md\|lg\|xl`, `block`, `pending`, + `ComponentProps<"button">`                   | `type="button"` domyślnie; `pending` ustawia `disabled` + `aria-busy` |
| `ButtonLink`                                    | jak `Button` bez `pending`/`type`, + `ComponentProps<Link>`                                                                             | `links.tsx`                                                           |
| `IconButton`                                    | `label` **wymagane**, + jak `Button`                                                                                                    | `aria-label`, nigdy `title`                                           |
| `Card`                                          | `tone` `plain\|tint\|dark\|glass`, `padding` `normal\|roomy\|flush`                                                                     | bez hover                                                             |
| `CardLink`                                      | jak `Card` + `ComponentProps<Link>`                                                                                                     | jedyny wariant z `translateY(-4px)` + `shadow-lg`                     |
| `Badge`                                         | `tone` `tint\|outline\|soft\|solid\|on-media`                                                                                           | tylko tekst; brak `onClick`/`href`                                    |
| `IconChip`                                      | `size` `xs\|sm\|md\|lg\|xl` (28/36/40/48/56), `tone` `soft\|solid\|on-dark\|brand`, `circle`, oraz **albo** `icon`, **albo** `children` | ikona skaluje się jako 0,45 krawędzi zaokrąglone do parzystej         |
| `Icon`                                          | `name` (39 nazw), `size`, `label`                                                                                                       | bez `label` → `aria-hidden`; z `label` → `role="img"`                 |
| `Eyebrow`                                       | `children`, `onDark`, `dash`                                                                                                            | `<p>`, nie `<h*>`; kreska 22×2 px `aria-hidden`                       |
| `SectionHeading`                                | `eyebrow`, `title`, `lead`, `action`, `align` `start\|center`, `onDark`, `as` `h2\|h3`                                                  | `action` przełącza układ na rząd                                      |
| `SubsectionTitle`                               | `children`, `as` `h2\|h3`                                                                                                               | jedna skala 1,6 rem                                                   |
| `PageHeader`                                    | `eyebrow`, `title`, `lead`, `children`                                                                                                  | H1; jedna szerokość 720 px                                            |
| `Field`                                         | `id` **wymagane**, `label`, `hint`, `error`, `required`, `children`                                                                     | `label htmlFor`; region błędu w DOM zawsze, z `aria-live`             |
| `Input` / `Textarea` / `Select` / `SearchInput` | `id` **wymagane**, `error`, `hint`, + props elementu                                                                                    | `aria-invalid` + `aria-describedby` wyliczane                         |
| `Checkbox`                                      | `id` **wymagane**, `label`, `error`, `boxed`                                                                                            | klikalny cały rząd ≥44 px                                             |
| `SegmentedControl`                              | `name`, `legend`, `hideLegend`, `options`, `value`, `tone` `green\|white`, `full`, `onChange`                                           | `fieldset`+`legend`+`radio`                                           |
| `FilterPillLink`                                | `active`, + `ComponentProps<Link>`                                                                                                      | `aria-current="page"`                                                 |
| `FilterPillToggle`                              | `active`, + `ComponentProps<"button">`                                                                                                  | `aria-pressed` w obu stanach                                          |
| `Notice`                                        | `tone` `success\|error\|info`, `icon`, `children`                                                                                       | `role="status"` + `aria-live="polite"`                                |

`links.tsx` to **jedyny** moduł tej warstwy, który zna `next/link`. Rozdział jest celowy: reszta warstwy da się wyrenderować i zmierzyć bez frameworka, czego wymaga bramka `tests/e2e/fundament-ui.spec.ts` (loader ESM Playwrighta nie rozwiązuje `next/link`).

### System ikon

`components/ui/icon-shapes.ts` jest **generowany** z `lucide-static@1.61.0` (licencja ISC). Zawiera 39 ikon: 29 z zakresu ISK-400, 9 ikon panelu, których karta nie wymieniła, a wzorzec używa (`plus`, `pencil`, `trash-2`, `eye`, `log-out`, `rotate-ccw`, `circle-check`, `mail-check`, `mail-x`), oraz `chevron-down` dla `Select`.

Wzorzec pobiera każdą ikonę z `unpkg.com` w runtime (`fetch` + `dangerouslySetInnerHTML`). Nie przenosimy tego: nowy CDN to nowy procesor w [`docs/zgodnosc/procesorzy.md`](zgodnosc/procesorzy.md), a nowa zależność łamie granicę ISK-399. Bundlujemy same kształty — **zero sieci w runtime i w czasie builda, zero pozycji w `package.json`**. Kształty są listą elementów renderowaną przez `createElement`, nie napisem HTML, więc `dangerouslySetInnerHTML` nie pojawia się w drzewie w ogóle.

Grubość kreski (`stroke-width: 2`) ustawia `Icon`, nie dane, więc **nie skaluje się z rozmiarem ikony** — tak samo jak we wzorcu.

### Ujednolicenia względem wzorca

Wzorzec jest prototypem ze stylami inline, więc ta sama rzecz ma w nim po kilka wartości. ISK-400 punkt 4 każe to ujednolicić, nie odtworzyć. Zmierzone rozjazdy i podjęte decyzje:

| Co                         | Wzorzec                                                                   | Fundament                   |
| -------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| wysokości przycisku        | 34/36/40/44/46/48/50/54/56 px                                             | 44/46/54/56                 |
| `letter-spacing` przycisku | `-0.01em` na 2 z 8                                                        | wszędzie                    |
| padding ghost vs primary   | mniejszy o 2 px przy różnicy krawędzi 0,5 px                              | jeden padding na rozmiar    |
| rozmiary `IconChip`        | 24/28/36/40/44/48/50/52/54/56/64/96 px                                    | 28/36/40/48/56              |
| `letter-spacing` eyebrow   | 0,04 / 0,06 / 0,08 em                                                     | 0,08 em (`--tracking-caps`) |
| H2 podsekcji               | 1,6 rem (kurs) / 1,5 rem (trener)                                         | 1,6 rem                     |
| `PageHeader`               | `max-width` 680 px + `space-8` (katalog) / 720 px + `space-10` (trenerzy) | 720 px + 2,5 rem            |
| warianty `Badge`           | 14, różniących się o 0,5 px                                               | jedna forma, 5 tonów        |
| focus pola                 | `border-color` green-700 (landing) / green-600 (panel)                    | green-700                   |
| cień panelu                | `shadow-lg` na panelu dofinansowań, brak na statystykach                  | `shadow-lg` na obu          |
| hover `translateY`         | `-3px` w jednym miejscu, `-4px` w pozostałych                             | `-4px`                      |

### Poprawki dostępności względem wzorca

Wzorzec ma tu luki, które fundament zamyka u źródła — każda jest zmierzona w `tests/e2e/fundament-ui.spec.ts` albo w `tests/unit/ui-komponenty.test.ts`:

- **Etykiety pól.** Wzorzec owija kontrolkę etykietą bez `htmlFor` albo stawia luźny `span`. `Field` wymaga `id` i wiąże `label htmlFor` — bez wartości domyślnej i bez `useId`, bo połowa formularzy renderuje się na serwerze.
- **Przełącznik segmentowy.** Wzorzec ma dwa niepowiązane `button`y: czytnik ekranu nie wie ani że to jedna kontrolka, ani która opcja jest wybrana, a strzałki nie działają. Fundament używa `fieldset`+`legend`+`radio`, czyli dostaje grupę, stan i obsługę strzałek natywnie — i działa bez JavaScriptu.
- **Komunikaty.** Region błędu pola jest w DOM **zawsze** (pusty, dopóki błędu nie ma) — `aria-live` ogłasza tylko zmiany w regionie, który istniał wcześniej. `Notice` ma `role="status"`; `tone="error"` świadomie **nie** używa `role="alert"`, bo `alert` przerywa bieżącą wypowiedź czytnika i kasuje informację o polu, w którym użytkownik właśnie jest.
- **Icon-buttony.** `IconButton` wymaga `label` (`aria-label`). Wzorzec używa `title`, którego klawiatura nie pokazuje nigdy.
- **Stan wysyłki.** `pending` ustawia `disabled` + `aria-busy`. Formularz wzorca można wysłać dowolną liczbę razy.
- **Cele dotykowe.** Pastylka segmentowa ma we wzorcu 40 px (hero) i 42 px (formularz), pigułka filtra 40 px, checkbox 18 px jako jedyny cel kliknięcia. W fundamencie każda kontrolka ma ≥44 px wysokości trafienia, a u checkboxa klikalny jest cały rząd etykiety.
- **Kontrast.** Podpowiedź pola używa we wzorcu `--text-muted` (#7E857A, ~3,8:1 na białym — poniżej AA). Fundament bierze `--text-secondary` (~6,4:1), tak jak lekarstwo na POW-4 w panelu.
- **Stan wybrany nie tylko kolorem.** `aria-current="page"` na pigułce-linku i `aria-pressed` na przełączniku (obecne też gdy `false` — brak atrybutu czyta się jak zwykły przycisk).
- **Select.** Wzorzec ustawia `appearance: none` i nie rysuje strzałki — pole wygląda jak zwykły input. `Select` rysuje własną, z `pointer-events: none`, żeby kliknięcie w nią otwierało listę.
- **Karty klikalne.** Hover z podniesieniem mają **tylko** `CardLink`. Wzorzec podnosi też karty bez akcji, czyli obiecuje interakcję, której nie ma. Karty są zawsze `Link`, nigdy `button` z `onClick` (granica ISK-399).
