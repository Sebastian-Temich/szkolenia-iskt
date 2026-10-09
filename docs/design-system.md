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

Fonty mają bezpieczne stosy systemowe. Nie pobieramy Google Fonts w runtime, dzięki czemu build i testy E2E pozostają hermetyczne i nie korzystają z publicznej sieci.
