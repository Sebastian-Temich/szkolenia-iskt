/**
 * ISK-401 / M2 — przepelnienie poziome mierzone na DZIECIACH, nie na korzeniu.
 *
 * DLACZEGO TEN PLIK ISTNIEJE, CHOC BRAMKA PRZEWIJANIA JUZ BYLA
 * Wszystkie dotychczasowe bramki przewijania w tym repozytorium (ISK-364 / P10
 * w `ux-blockers.spec.ts`, trzy testy w `public-pages.spec.ts`) sprawdzaja
 * `document.documentElement.scrollWidth <= window.innerWidth`. Ten pomiar jest
 * NIEFALSYFIKOWALNY w momencie, w ktorym korzen dokumentu dostaje
 * `overflow-x: hidden`: przegladarka przestaje wtedy raportowac przepelnienie
 * na korzeniu, element dalej wychodzi poza kadr, a bramka jest zielona. To nie
 * jest teoretyczne — zmierzony fakt w tym projekcie (ISK-399, lista pulapek
 * weryfikacyjnych): ukrycie przewijania na korzeniu zamaskowalo element szerszy
 * od kadru i gates przeszly.
 *
 * Dlatego tutaj chodzimy po KAZDYM elemencie dokumentu i pytamy o jego wlasna
 * geometrie. Element, ktory wystaje poza kadr, jest defektem nawet wtedy, gdy
 * korzen go przycina: tresc jest wtedy nieosiagalna, a nie "schowana".
 *
 * ZASADA WYLACZEN (trzy, kazde uzasadnione)
 *  1. zerowa geometria — element nie jest widoczny, wiec nie ma czego mierzyc;
 *  2. `position: fixed` — element jest wzgledem kadru, nie wzgledem dokumentu,
 *     i nie wnosi przewijania (tak tez liczy to przegladarka);
 *  3. przyciecie przez PRZODKA WEWNATRZ `body` (`overflow-x` inne niz
 *     `visible`) — ornament celowo wypuszczony poza sekcje, ktora go obcina, nie
 *     tworzy przewijania strony. `html` i `body` sa z tej reguly WYLACZONE
 *     swiadomie: przyciecie na korzeniu to dokladnie to alibi, ktorego ta bramka
 *     nie przyjmuje.
 */
import { expect, test, type Page } from "@playwright/test";

/** Wszystkie trasy publiczne — razem z dwiema, ktorych M2 nie przebudowal. */
const WIDOKI = [
  "/",
  "/szkolenia",
  "/szkolenia/wprowadzenie-do-ai",
  "/trenerzy",
  "/kontakt",
  "/polityka-prywatnosci",
] as const;

/**
 * 320 px to najwezszy ekran, jaki ISK-412 ma pokryc, 1440 — pelny desktop.
 *
 * 320 PX DOLOZONE W ISK-412 I NIE JEST TO KOSMETYKA: bramka UX zmierzyla tam
 * przepelnienie 4 px, ktorego ta bramka NIE WIDZIALA, bo zaczynala od 360 px.
 * Zrodlem byla pastylka przelacznika rodzaju zgloszenia — `white-space: nowrap`
 * razem ze stalym `padding-inline` ustawia jej szerokosc min-content szerzej
 * niz karta, a `flex` nie kurczy elementu ponizej min-content, wiec pastylka
 * wychodzila poza kadr zamiast sie zwezic. Przy 360 px miescila sie dokladnie,
 * czyli defekt istnial tylko w pasmie, ktorego nikt nie mierzyl.
 */
const SZEROKOSCI = [320, 360, 768, 1440] as const;

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

type Przepelnienie = {
  kadr: number;
  scrollWidth: number;
  winowajcy: string[];
};

async function zmierzPrzepelnienie(page: Page): Promise<Przepelnienie> {
  return page.evaluate(() => {
    // `clientWidth`, a nie `innerWidth`: gdyby pasek przewijania zajmowal
    // miejsce w ukladzie, `innerWidth` bylby o jego szerokosc wieksze od kadru,
    // w ktorym policzono `getBoundingClientRect` — i kazdy element dotykajacy
    // prawej krawedzi "miescilby sie" o 15 px za duzo.
    const kadr = document.documentElement.clientWidth;
    const limit = kadr + 1;

    const opis = (el: Element) => {
      const klasy = Array.from(el.classList).slice(0, 4).join(".");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
        klasy ? `.${klasy}` : ""
      }`;
    };

    /** Czytelna sciezka (cztery poziomy), zeby blad dal sie zdiagnozowac. */
    const sciezka = (el: Element) => {
      const czesci: string[] = [];
      let node: Element | null = el;
      for (let i = 0; node && i < 4; i += 1) {
        czesci.unshift(opis(node));
        node = node.parentElement;
      }
      return czesci.join(" > ").slice(0, 220);
    };

    /** Czy jakis przodek WEWNATRZ `body` obcina poziomo (patrz naglowek). */
    const przycietyPrzezSekcje = (el: Element) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX !== "visible") return true;
        node = node.parentElement;
      }
      return false;
    };

    const winowajcy: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      if (rect.right <= limit && rect.width <= limit) continue;
      if (przycietyPrzezSekcje(el)) continue;
      winowajcy.push(
        `${sciezka(el)} — right=${Math.round(rect.right)}, width=${Math.round(
          rect.width,
        )}, kadr=${kadr}`,
      );
      // Dwunastu winowajcow wystarcza do diagnozy; dalej to ta sama przyczyna.
      if (winowajcy.length >= 12) break;
    }

    return {
      kadr,
      scrollWidth: document.documentElement.scrollWidth,
      winowajcy,
    };
  });
}

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
