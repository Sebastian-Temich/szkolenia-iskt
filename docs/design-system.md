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
