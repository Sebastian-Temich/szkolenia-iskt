/**
 * ISK-403 / M4a — przejscie focusem i kontrast pierscienia.
 *
 * Osobny plik, bo to jedyny pomiar, ktorego DZIS NIE ROBI zaden gate (wprost
 * wskazane w karcie). Aplikacja ma JEDEN globalny pierscien
 * `--focus-ring: color-mix(in srgb, var(--color-green-500) 55%, transparent)`
 * z `outline-offset: 2px`, wiec pierscien laduje na tle OTOCZENIA elementu.
 * Na ciemnych powierzchniach (`.detail-aside`, `.site-footer`, sekcje
 * `--color-ink-900`, gradient markowy panelu) jego kontrast moze spasc ponizej
 * progu 3:1 z WCAG 2.1 SC 1.4.11 (Non-text Contrast).
 *
 * Mierzymy >= 25 kolejnych Tabow (kryterium odbioru karty) na widokach, ktore
 * maja i jasne, i ciemne powierzchnie.
 */
import { test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";
import { przejscieFocusem } from "./helpers/isk403-pomiar";
import { przygotujKatalogi, zapiszPomiar } from "./helpers/isk403-zbieracz";

/** Liczba Tabow z marginesem nad wymagane 25. */
const LICZBA_TABOW = 40;

test.beforeAll(przygotujKatalogi);

const PUBLICZNE = [
  // `.detail-aside` (ink-900) + ciemna stopka.
  ["kurs", "/szkolenia/wprowadzenie-do-ai"],
  // Ciemna stopka i sekcje na ink-900.
  ["landing", "/"],
  // Pola formularza maja pierscien w `box-shadow`, nie `outline`.
  ["kontakt", "/kontakt"],
  ["katalog", "/szkolenia"],
] as const;

for (const [klucz, sciezka] of PUBLICZNE) {
  test(`focus: ${klucz} — ${LICZBA_TABOW} Tabow z pomiarem kontrastu pierscienia`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(sciezka, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Start od poczatku dokumentu, zeby kolejnosc Tabow byla powtarzalna.
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    const probki = await przejscieFocusem(page, LICZBA_TABOW);
    await zapiszPomiar(`focus-${klucz}`, probki);
  });
}

test(`focus: panel-zgloszenia — ${LICZBA_TABOW} Tabow (gradient markowy)`, async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsAdmin(page);
  await page.goto("/panel/zgloszenia", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  const probki = await przejscieFocusem(page, LICZBA_TABOW);
  await zapiszPomiar("focus-panel-zgloszenia", probki);
});
