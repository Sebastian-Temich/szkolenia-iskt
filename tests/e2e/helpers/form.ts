// Pomocnik dla formularza zgloszen (ADR-0004 §3 warstwa 2).
import type { Page } from "@playwright/test";

import { MIN_FILL_MS } from "../../../lib/security/form-token";

const SAFETY_MS = 400;

/**
 * Wywolaj po wypelnieniu formularza, bezposrednio przed wyslaniem.
 * Token istnieje juz w tym momencie, wiec pelne okno od tego punktu gwarantuje
 * jego dojrzalosc. performance.now() mierzy wiek dokumentu, nie tokenu:
 * nawigacja klientowa ze szczegolu szkolenia nie zeruje tego zegara.
 * Nie odczytujemy ani nie modyfikujemy podpisanego tokenu aplikacji.
 */
export async function awaitFormTokenMaturity(page: Page): Promise<void> {
  await page.waitForTimeout(MIN_FILL_MS + SAFETY_MS);
}
