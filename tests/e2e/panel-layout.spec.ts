// Regresje dla defektow POW-1 i POW-5 z raportu QA E6 (`docs/qa/raport-e6.md`).
//
// POW-1: panel byl renderowany wewnatrz publicznego layoutu, wiec kazda strona
// panelu miala dwa landmarki `banner`, dwie nawigacje i marketingowa stopke
// (WCAG 1.3.1). Tego nie wylapie skan axe — zdublowany `banner` jest poprawnym
// HTML-em, a tylko bledna informacja dla czytnika ekranu.
//
// POW-5: trzecia sekcja nawigacji panelu wychodzila za ekran przy 360 px.
// Link byl osiagalny (nawigacja przewijala sie w poziomie), wiec asercja
// "dokument nie przewija sie w bok" z `visual-evidence.spec.ts` byla zielona.
// Dlatego mierzymy geometrie samych linkow, a nie przewijanie dokumentu.
//
// UWAGA — dlaczego tryb `serial` i jedno logowanie na caly plik, a nie
// `loginAsAdmin` w kazdym tescie jak w pozostalych spekach: GoTrue ma limit
// `sign_in_sign_ups = 30` na 5 minut na adres IP (`supabase/config.toml`).
// Caly zestaw E2E jest juz blisko tego progu, a osiem kolejnych logowan
// przez UI przepychalo go ponad — testy czerwienily sie na "Nie udalo sie
// zalogowac", czyli na limicie, nie na defekcie, ktorego pilnuja. Jedna sesja
// wystarcza: zaden z tych przypadkow nie sprawdza samego logowania (to robi
// `panel-dostep.spec.ts`), tylko powloke i geometrie nawigacji.
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

const panelViews = [
  ["start", "/panel"],
  ["szkolenia", "/panel/szkolenia"],
  ["trenerzy", "/panel/trenerzy"],
  ["zgloszenia", "/panel/zgloszenia"],
] as const;

const PHONE_WIDTH = 360;
const DESKTOP = { width: 1280, height: 900 };

/** Sekcje, ktore administrator musi zobaczyc w nawigacji panelu. */
const sections = ["Szkolenia", "Trenerzy", "Zgłoszenia"] as const;

function panelNav(page: Page) {
  return page.getByRole("navigation", { name: "Nawigacja panelu" });
}

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await loginAsAdmin(page);
});

test.afterAll(async () => {
  await page.close();
});

test.describe("POW-1: panel ma wlasna powloke, bez publicznego layoutu", () => {
  for (const [name, path] of panelViews) {
    test(`${name} (${path}): jeden banner, brak publicznej nawigacji i stopki`, async () => {
      await page.setViewportSize(DESKTOP);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(panelNav(page)).toBeVisible();
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(
        page.getByRole("navigation", { name: "Główna nawigacja" }),
      ).toHaveCount(0);
      await expect(page.getByRole("contentinfo")).toHaveCount(0);
      // Marketingowy link "Zapytaj o szkolenie" z publicznego naglowka nie ma
      // czego robic w narzedziu roboczym administratora.
      await expect(
        page.getByRole("link", { name: /Zapytaj o szkolenie/ }),
      ).toHaveCount(0);
    });
  }
});

test.describe("POW-5: nawigacja panelu przy 360 px", () => {
  for (const [name, path] of panelViews) {
    test(`${name} (${path}): wszystkie sekcje widoczne w obrebie ekranu`, async () => {
      await page.setViewportSize({ width: PHONE_WIDTH, height: 900 });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      const nav = panelNav(page);
      await expect(nav).toBeVisible();

      for (const section of sections) {
        const link = nav.getByRole("link", { name: section, exact: true });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box, `link "${section}" nie ma geometrii`).not.toBeNull();
        expect(
          Math.round(box!.x + box!.width),
          `link "${section}" wychodzi za prawa krawedz ekranu`,
        ).toBeLessThanOrEqual(PHONE_WIDTH);
        expect(
          Math.round(box!.x),
          `link "${section}" wychodzi za lewa krawedz ekranu`,
        ).toBeGreaterThanOrEqual(0);
      }

      // Zaden link nie jest schowany za przewijaniem nawigacji: cala tresc
      // nawigacji musi sie miescic w jej wlasnej ramce.
      const overflow = await nav.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `nawigacja panelu przewija sie w poziomie (${overflow.scrollWidth} > ${overflow.clientWidth})`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});
