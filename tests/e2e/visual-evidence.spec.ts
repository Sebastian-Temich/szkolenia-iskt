// Dowody RWD (DoD E6): zrzuty wszystkich widokow publicznych ORAZ panelu
// w trzech szerokosciach — 360 (telefon), 768 (tablet), 1280 (desktop).
//
// Testy sa pomijane, dopoki nie ustawisz EVIDENCE_DIR — w CI nie chcemy
// generowac kilkudziesieciu zrzutow przy kazdym przebiegu. Oprocz zapisania
// zrzutu kazdy przypadek sprawdza twarde kryterium RWD: brak poziomego
// przewijania. Sam zrzut nie jest asercja — trzeba jeszcze cos stwierdzic.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

const publicViews = [
  ["home", "/"],
  ["katalog", "/szkolenia"],
  ["szczegol", "/szkolenia/wprowadzenie-do-ai"],
  ["trenerzy", "/trenerzy"],
  ["kontakt", "/kontakt"],
  ["logowanie", "/panel/logowanie"],
] as const;

const panelViews = [
  ["panel-start", "/panel"],
  ["panel-szkolenia", "/panel/szkolenia"],
  ["panel-trenerzy", "/panel/trenerzy"],
  ["panel-zgloszenia", "/panel/zgloszenia"],
] as const;

const widths = [360, 768, 1280] as const;
const evidenceDirectory = process.env.EVIDENCE_DIR;

async function capture(page: Page, name: string, width: number) {
  await mkdir(evidenceDirectory!, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceDirectory!, `${name}-${width}.png`),
    fullPage: true,
  });
  // Twarde kryterium RWD: zadna szerokosc nie moze wywolac przewijania w bok.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${name} @${width}px przewija sie poziomo (${overflow.scrollWidth} > ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

for (const width of widths) {
  for (const [name, url] of publicViews) {
    test(`${name} — dowod RWD ${width}px`, async ({ page }) => {
      test.skip(
        !evidenceDirectory,
        "Ustaw EVIDENCE_DIR, aby wygenerowac dowody.",
      );
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await capture(page, name, width);
    });
  }
}

// Panel wymaga sesji administratora, wiec logujemy sie raz na szerokosc
// i w jednym tescie obchodzimy wszystkie jego widoki.
test.describe("panel administratora", () => {
  for (const width of widths) {
    test(`panel — dowody RWD ${width}px`, async ({ page }) => {
      test.skip(
        !evidenceDirectory,
        "Ustaw EVIDENCE_DIR, aby wygenerowac dowody.",
      );
      await page.setViewportSize({ width, height: 900 });
      await loginAsAdmin(page);
      for (const [name, url] of panelViews) {
        await page.goto(url);
        await capture(page, name, width);
      }
    });
  }
});
