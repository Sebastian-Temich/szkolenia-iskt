// Pomocniki dla formularza zgloszen.
//
// ADR-0004 §3 warstwa 2: serwer wydaje podpisany token czasowy przy renderze
// strony i odrzuca wyslanie szybsze niz `MIN_FILL_MS` (3 s) od wydania tokenu
// — bot wypelnia formularz natychmiast, czlowiek nie. Playwright wypelnia pola
// w ~300 ms, wiec kazdy test wysylajacy formularz musi odczekac reszte okna.
//
// Celowo nie wpisujemy tu `waitForTimeout(3500)`: liczymy czas, ktory faktycznie
// uplynal od nawigacji, i dospimy tylko brakujaca roznice. Staly sleep jest
// jednoczesnie za dlugi (mnozy sie przez liczbe testow) i kruchy (przy wolnej
// kompilacji w trybie dev nie wiadomo, od kiedy liczyc).
import type { Page } from "@playwright/test";

/** Musi odpowiadac `MIN_FILL_MS` z `lib/security/form-token.ts`. */
const MIN_FILL_MS = 3_000;
/** Zapas na opoznienie sieciowe miedzy klikiem a weryfikacja po stronie serwera. */
const SAFETY_MS = 400;

/**
 * Czeka, az token formularza bedzie dosc "dojrzaly", zeby serwer przyjal
 * wyslanie. Wywolaj bezposrednio przed klikniecieem „Wyślij zgłoszenie”.
 */
export async function awaitFormTokenMaturity(page: Page): Promise<void> {
  // `performance.now()` na biezacym dokumencie = czas od jego zaladowania,
  // czyli od momentu, w ktorym serwer wydal token.
  const sinceLoad = await page.evaluate(() => performance.now());
  const remaining = MIN_FILL_MS + SAFETY_MS - sinceLoad;
  if (remaining > 0) await page.waitForTimeout(remaining);
}
