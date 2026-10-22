/**
 * Pomiar przepelnienia poziomego na DZIECIACH, nie na korzeniu dokumentu.
 *
 * Wyciagniete z `tests/e2e/widoki-publiczne-rwd.spec.ts` w ISK-411, bo bramka
 * nawigacji mobilnej musi zmierzyc to samo przy OTWARTYM panelu. Kopia tej
 * funkcji w drugim pliku rozjechalaby sie z pierwsza przy nastepnej poprawce,
 * a to wlasnie ten pomiar jest jedynym nieoszukiwalnym — dlatego ma jedno
 * zrodlo.
 *
 * DLACZEGO NIE `document.scrollWidth`
 * Kazda wczesniejsza bramka przewijania w tym repozytorium sprawdzala
 * `documentElement.scrollWidth <= innerWidth`. Ten pomiar jest
 * NIEFALSYFIKOWALNY w momencie, w ktorym korzen dostaje `overflow-x: hidden`:
 * przegladarka przestaje raportowac przepelnienie, element dalej wychodzi poza
 * kadr, a bramka jest zielona. Zmierzony fakt w tym projekcie (ISK-399, lista
 * pulapek weryfikacyjnych). Dlatego chodzimy po KAZDYM elemencie i pytamy
 * o jego wlasna geometrie.
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
import type { Page } from "@playwright/test";

export type Przepelnienie = {
  kadr: number;
  scrollWidth: number;
  winowajcy: string[];
};

export async function zmierzPrzepelnienie(page: Page): Promise<Przepelnienie> {
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
