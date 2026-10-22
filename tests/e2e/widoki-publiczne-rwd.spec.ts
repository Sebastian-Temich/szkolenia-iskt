/**
 * ISK-401 / M2 — przepelnienie poziome mierzone na DZIECIACH, nie na korzeniu,
 * oraz tory siatki rozwiazane do pikseli.
 *
 * Sam pomiar przepelnienia (i pelne uzasadnienie, dlaczego NIE przez
 * `document.scrollWidth`) mieszka w `helpers/uklad.ts` — ISK-411 wyciagnal go
 * tam, bo bramka nawigacji mobilnej mierzy to samo przy otwartym panelu.
 */
import { expect, test } from "@playwright/test";

import { zmierzPrzepelnienie } from "./helpers/uklad";

/** Wszystkie trasy publiczne — razem z dwiema, ktorych M2 nie przebudowal. */
const WIDOKI = [
  "/",
  "/szkolenia",
  "/szkolenia/wprowadzenie-do-ai",
  "/trenerzy",
  "/kontakt",
  "/polityka-prywatnosci",
] as const;

/** 360 px to najwezszy ekran z zakresu zlecenia, 1440 — pelny desktop wzorca. */
const SZEROKOSCI = [360, 768, 1440] as const;

/**
 * Minimalna szerokosc toru siatki przy 360 px.
 *
 * Wzorzec trzyma siatke wyroznionych szkolen na `repeat(4, 1fr)` bez ani jednej
 * reguly `@media`, wiec przy 360 px tor schodzi do ~62 px — karta zostaje
 * narysowana, tekst w niej lamie sie po jednym slowie i nie da sie jej
 * przeczytac. Zaden pomiar przepelnienia tego nie widzi, bo siatka MIESCI sie
 * w kadrze. 120 px to prog, ponizej ktorego kolumna przestaje byc kolumna.
 */
const MIN_TOR_PX = 120;

for (const path of WIDOKI) {
  for (const width of SZEROKOSCI) {
    test(`${path} @ ${width}px: zaden element nie wychodzi poza kadr`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(path);
      // Pomiar na stronie bledu nie dowodzilby niczego o ukladzie.
      expect(response?.status()).toBe(200);

      const metryki = await zmierzPrzepelnienie(page);
      expect(
        metryki.winowajcy,
        `${path} @ ${width}px: elementy poza kadrem (${metryki.winowajcy.length}):\n${metryki.winowajcy.join(
          "\n",
        )}`,
      ).toEqual([]);

      // Asercja DODATKOWA, nie glowna. Zostaje, bo tani pomiar na korzeniu
      // lapie przypadek, w ktorym przepelnienie wnosi sam `body` (wtedy petla
      // wyzej nie ma na co wskazac). Sama by nie wystarczyla: `overflow-x`
      // inny niz `visible` na korzeniu zeruje ja na stale, a element dalej
      // wystaje — i to wlasnie przepuscily poprzednie bramki.
      expect(
        metryki.scrollWidth,
        `${path} @ ${width}px: scrollWidth ${metryki.scrollWidth} > kadr ${metryki.kadr}`,
      ).toBeLessThanOrEqual(metryki.kadr + 1);
    });
  }

  test(`${path} @ 360px: zaden tor siatki nie schodzi ponizej ${MIN_TOR_PX}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);

    const waskie = await page.evaluate((min) => {
      const opis = (el: Element) => {
        const klasy = Array.from(el.classList).slice(0, 4).join(".");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
          klasy ? `.${klasy}` : ""
        }`;
      };

      const wyniki: string[] = [];
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const style = getComputedStyle(el);
        if (style.display !== "grid" && style.display !== "inline-grid") {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // `gridTemplateColumns` czytany z `getComputedStyle` jest ROZWIAZANY:
        // przegladarka oddaje uzyte piksele ("311px" / "62px 62px 62px 62px"),
        // a nie zapis `repeat(4, 1fr)`. Dlatego ten pomiar widzi defekt, ktorego
        // czytanie arkusza nie pokaze.
        const tory = style.gridTemplateColumns
          .split(/\s+/)
          .filter((token) => token.endsWith("px"))
          .map((token) => Number.parseFloat(token))
          .filter((value) => Number.isFinite(value));

        // Siatka jednotorowa to POPRAWNY uklad waskiego ekranu — jej jedyny tor
        // jest kontenerem, wiec mierzenie go nie mowi nic o czytelnosci. Defekt
        // wzorca polega na tym, ze siatka ZOSTAJE wielokolumnowa przy 360 px.
        if (tory.length < 2) continue;
        if (tory.every((tor) => tor >= min)) continue;

        wyniki.push(
          `${opis(el)} — gridTemplateColumns="${style.gridTemplateColumns}"`,
        );
      }
      return wyniki;
    }, MIN_TOR_PX);

    expect(
      waskie,
      `${path} @ 360px: siatki z torem ponizej ${MIN_TOR_PX}px:\n${waskie.join("\n")}`,
    ).toEqual([]);
  });
}
