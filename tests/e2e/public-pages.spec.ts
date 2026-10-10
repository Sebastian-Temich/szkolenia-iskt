import { expect, test } from "@playwright/test";

import {
  createDraftTraining,
  type DraftTraining,
} from "./helpers/draft-training";

// Skany axe dla tych samych widokow mieszkaja w `dostepnosc.spec.ts` — tutaj
// zostaje wylacznie dowod, ze widok sie renderuje i zwraca poprawny status.
// Wczesniej ta sama strona byla skanowana trzykrotnie (home/kontakt/public).
const pages = [
  ["/", "Kompetencje, które zmieniają"],
  ["/szkolenia", "Znajdź szkolenie"],
  ["/szkolenia/wprowadzenie-do-ai", "[DEMO] Wprowadzenie do AI"],
  ["/trenerzy", "Ekspertki i eksperci"],
  // Strone /kontakt dostarcza E4 (hostuje formularz) — stad jej naglowek.
  ["/kontakt", "Zapytaj o szkolenie"],
] as const;

for (const [path, heading] of pages) {
  test(`${path} renderuje publiczny widok`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      heading,
    );
  });
}

test.describe("ochrona szkicow", () => {
  let draft: DraftTraining;

  test.beforeAll(async () => {
    draft = await createDraftTraining();
  });

  test.afterAll(async () => {
    await draft?.remove();
  });

  test("realny nieopublikowany wiersz zwraca 404 pod bezposrednim URL", async ({
    page,
  }) => {
    const response = await page.goto(`/szkolenia/${draft.slug}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Nie znaleźliśmy",
    );
  });

  test("szkic nie wycieka do katalogu ani do sitemap.xml", async ({
    page,
    request,
  }) => {
    await page.goto("/szkolenia");
    await expect(page.getByText("Szkic nieopublikowany")).toHaveCount(0);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain(draft.slug);
  });
});

test("nieistniejace szkolenie zwraca 404", async ({ page }) => {
  const response = await page.goto("/szkolenia/nie-ma-takiego-szkolenia");
  expect(response?.status()).toBe(404);
});

test("filtr i wyszukiwanie są zapisane w URL", async ({ page }) => {
  await page.goto("/szkolenia");
  await page.getByLabel("Wyszukaj").fill("AI");
  await page.getByLabel("Obszar").selectOption("ai");
  await page.getByRole("button", { name: "Pokaż wyniki" }).click();
  await expect(page).toHaveURL(/category=ai/);
  await expect(page).toHaveURL(/q=AI/);
  await expect(
    page.getByRole("heading", { name: "[DEMO] Wprowadzenie do AI" }),
  ).toBeVisible();
});

test("wyszukiwanie znajduje tresc gdy fraza ma polskie znaki", async ({
  page,
}) => {
  // Seed trzyma tytuly bez diakrytykow, a search_tsv jest zbudowane na tekscie
  // po unaccent. Fraza wpisana z polskimi znakami musi trafic w ten sam zapis.
  await page.goto(`/szkolenia?q=${encodeURIComponent("zrównoważony")}`);
  await expect(
    page.getByRole("link", { name: /Zrownowazony rozwoj i ESG/ }),
  ).toBeVisible();
});

for (const width of [360, 768, 1280]) {
  test(`strona główna nie przewija się poziomo przy ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  // Regresja klasy ISK-355: nazwa wlasnej klasy kolidujaca z utility Tailwinda
  // (warstwa `utilities` wygrywa z `components`) kasuje marginesy i wysrodkowanie,
  // a sama strona dalej renderuje sie "poprawnie". Mierzymy wiec realny uklad.
  test(`tresc ma marginesy boczne i jest wysrodkowana przy ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const layout = await page.evaluate(() => {
      const shell = document.querySelector("main .page-shell");
      if (!shell) return null;
      const box = shell.getBoundingClientRect();
      return { left: box.left, right: window.innerWidth - box.right };
    });
    expect(layout).not.toBeNull();
    expect(layout!.left).toBeGreaterThan(0);
    expect(Math.abs(layout!.left - layout!.right)).toBeLessThanOrEqual(1);
  });
}
