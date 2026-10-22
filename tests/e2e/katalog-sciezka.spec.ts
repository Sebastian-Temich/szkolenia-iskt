// ADR-0005 D5, sciezka 1 — jedno ciagle przejscie uzytkownika:
// strona glowna -> katalog -> filtr po kategorii -> wyszukiwanie -> szczegol.
//
// Swiadomie klikamy, zamiast wchodzic na gotowe URL-e z parametrami. Testy
// per-widok (public-pages.spec.ts) dowodza, ze kazdy ekran sie renderuje; ta
// sciezka dowodzi, ze da sie *przejsc* miedzy nimi — nawigacja, linki i
// zachowanie parametrow w adresie to osobne zrodlo defektow.
import { expect, test } from "@playwright/test";

import { AUDIENCE_COPY, AUDIENCE_DEFAULT } from "../../lib/audience";
import {
  createTraining,
  deleteTraining,
  publishedCategory,
  type TrainingSeed,
} from "./helpers/data";

test.describe("D5.1 — przejscie od strony glownej do szczegolu szkolenia", () => {
  let training: TrainingSeed;
  let categorySlug: string;

  test.beforeAll(async () => {
    // Wlasne, opublikowane szkolenie w kategorii z seeda [DEMO]. Dzieki temu
    // asercje nie zaleza od tego, ile pozycji ma aktualny seed.
    const category = await publishedCategory();
    categorySlug = category.slug;
    training = await createTraining({
      published: true,
      categoryId: category.id,
      titlePrefix: "[TEST] Sciezka katalogu",
    });
  });

  test.afterAll(async () => {
    if (training?.id) await deleteTraining(training.id);
  });

  test("uzytkownik przechodzi cala sciezke klikajac, a filtry zostaja w URL", async ({
    page,
  }) => {
    // 1. Strona glowna. H1 zamrazal napis "Kompetencje, które zmieniają" —
    // tytulem steruje teraz przelacznik audytorium, wiec bierzemy tekst stanu
    // domyslnego z `lib/audience.ts`, zamiast przepisywac copy do testu.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      AUDIENCE_COPY[AUDIENCE_DEFAULT].heroTitle,
    );

    // 2. Przejscie do katalogu linkiem ze strony glownej (nie przez adres).
    // Etykieta wzorca brzmi "Cały katalog" i siedzi w slocie akcji naglowka
    // sekcji "Szkolenia, które wyróżniamy"; "Pełny katalog" bylo nazwa poprzedniej
    // wersji. Asercja dalej mierzy to samo: ze z `/` wychodzi sie do katalogu
    // kliknieciem, a nie wpisaniem adresu.
    await page
      .getByRole("link", { name: /Cały katalog/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/szkolenia$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Znajdź szkolenie",
    );

    // 3. Filtr po kategorii. Bylo: `getByLabel("Obszar").selectOption(slug)`
    // plus wysylka formularza — kontrolka, ktorej juz nie ma. Pigulka-link
    // zapisuje obszar w adresie jednym kliknieciem, czyli ta sama zmiana
    // stanu, jeden krok mniej do zepsucia. Kontrakt `?category=` bez zmian.
    await page
      .getByRole("navigation", { name: "Filtr obszarów" })
      .locator(`a[href*="category=${categorySlug}"]`)
      .click();
    await expect(page).toHaveURL(new RegExp(`category=${categorySlug}`));
    // Nazwa dostepna karty to DOKLADNIE tytul szkolenia: cala karta jest jednym
    // `Link` z `aria-label={training.title}` (`components/training-card.tsx`).
    // Dlatego ten sam selektor dziala po przebudowie karty, mimo ze zniknal
    // drugi odnosnik w stopce karty.
    await expect(
      page.getByRole("link", { name: training.title }).first(),
    ).toBeVisible();

    // 4. Wyszukiwanie zawezajace w obrebie wybranego filtra. Fraza jest
    // fragmentem wlasnego tytulu, wiec wynik jest deterministyczny.
    await page.getByLabel("Wyszukaj").fill("Sciezka katalogu");
    await page.getByRole("button", { name: "Pokaż wyniki" }).click();
    // Oba parametry musza przetrwac — adres jest tu kontraktem (udostepnianie
    // linku do wynikow filtrowania).
    await expect(page).toHaveURL(new RegExp(`category=${categorySlug}`));
    await expect(page).toHaveURL(/q=Sciezka(\+|%20)katalogu/);

    // 5. Wejscie w szczegol z karty wyniku.
    await page.getByRole("link", { name: training.title }).first().click();
    await expect(page).toHaveURL(`/szkolenia/${training.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      training.title,
    );
  });

  test("filtr bez wynikow pokazuje stan pusty, a nie pusta strone", async ({
    page,
  }) => {
    await page.goto("/szkolenia");
    await page
      .getByLabel("Wyszukaj")
      .fill("fraza-ktora-nie-istnieje-w-katalogu-xyz");
    await page.getByRole("button", { name: "Pokaż wyniki" }).click();

    await expect(
      page.getByRole("heading", { name: "Brak wyników" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Wyczyść filtry" }),
    ).toBeVisible();
  });
});
