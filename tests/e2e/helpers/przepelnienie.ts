/**
 * ISK-413 / CR-I3 — detektor przepelnienia poziomego, mierzony na DZIECIACH.
 *
 * DLACZEGO OSOBNY PLIK, A NIE FUNKCJA W SPECU
 * Ten detektor ma wlasne drugie ramie (`widoki-publiczne-rwd.spec.ts`,
 * `describe("drugie ramie")`), ktore wstrzykuje element za szeroki i wymaga,
 * zeby detektor go ZGLOSIL. Dowod jest wart tyle, ile warte jest to, ze oba
 * ramiona mierza TEN SAM kod. Kopia predykatu w drugim pliku rozjechalaby sie
 * po pierwszej poprawce i ramie negatywne zaczeloby potwierdzac samo siebie.
 *
 * ZASADA WYLACZEN (cztery, kazde uzasadnione)
 *  1. zerowa geometria — element nie jest widoczny, wiec nie ma czego mierzyc;
 *  2. `position: fixed` — element jest wzgledem kadru, nie wzgledem dokumentu,
 *     i nie wnosi przewijania (tak tez liczy to przegladarka);
 *  3. ORNAMENT przyciety przez przodka wewnatrz `body` — patrz nizej;
 *  4. `html` i `body` sa z reguly przycinania WYLACZONE swiadomie: przyciecie
 *     na korzeniu to dokladnie to alibi, ktorego ta bramka nie przyjmuje.
 *
 * ZAKRES WYJATKU NA PRZYCIECIE — ZAWEZONY (ISK-404 / CR-I3)
 * Pierwotny predykat zwalnial KAZDY element, ktorego dowolny przodek ma
 * `overflow-x` inne niz `visible`. Zestawione z arkuszem nie byl to waski
 * wyjatek, a amnestia dla calych poddrzew:
 *   - `.home-hero { overflow: hidden }` zwalnialo cale hero razem z `h1`,
 *     leadem i rzedem CTA;
 *   - `.ui-card-flush { overflow: hidden }` na `.training-card` zwalnialo
 *     wnetrze KAZDEJ karty szkolenia, z jej tytulem i cena;
 *   - `overflow-y: auto` wymusza wyliczone `overflow-x: auto`, co po cichu
 *     zwalnialo dowolne poddrzewo bez ani jednej widocznej zmiany w arkuszu.
 *
 * Wyjatek jest teraz zawezony dwoma warunkami naraz:
 *
 *  a) element musi byc ORNAMENTEM, czyli `pointer-events: none` ORAZ lezec
 *     w poddrzewie `aria-hidden="true"`. Taki element nie istnieje ani dla
 *     czytnika ekranu, ani dla myszy, ani dla zaznaczenia — przyciecie go nie
 *     zabiera uzytkownikowi niczego. Naglowek, rzad CTA i tytul karty nie
 *     spelniaja ZADNEGO z tych dwoch warunkow, wiec zaden z nich nie
 *     przeslizgnie sie przez ten wyjatek nawet w calkowicie przycietej sekcji.
 *
 *  b) przycinajacy przodek musi miec `overflow-x` rowne `hidden` albo `clip`.
 *     `auto` i `scroll` NIE sa alibi: tworza wlasny kontener przewijania, czyli
 *     tresc jest osiagalna dopiero po przewinieciu sekcji w poziomie — to
 *     osobny defekt (tak wlasnie znikala kolumna „Akcje", ISK-364 / P8), a nie
 *     usprawiedliwienie. Ten warunek zamyka zarazem pulapke `overflow-y: auto`.
 *
 * Ornamenty sa dalej realnie zwalniane: `.home-hero-glow-b` ma przy 1440 px
 * `right: -160px` i prawa krawedz 1600 px przy kadrze 1440 px. Dlatego wyjatek
 * zostaje — ale juz tylko dla tego, co faktycznie jest ozdoba. Lista zwolnionych
 * wraca w `zwolnieni`, zeby amnestia byla WIDOCZNA w asercji, a nie cicha.
 */
import type { Page } from "@playwright/test";

export type Przepelnienie = {
  /** `clientWidth` korzenia — kadr, w ktorym policzono prostokaty. */
  kadr: number;
  /** Pomiar DODATKOWY, patrz komentarz przy asercji w specu. */
  scrollWidth: number;
  /** Elementy wychodzace poza kadr, ktorych nic nie usprawiedliwia. */
  winowajcy: string[];
  /** Ornamenty zwolnione przez zawezony wyjatek — amnestia jawna, nie cicha. */
  zwolnieni: string[];
};

/** Dwunastu winowajcow wystarcza do diagnozy; dalej to ta sama przyczyna. */
const LIMIT_RAPORTU = 12;

export async function zmierzPrzepelnienie(page: Page): Promise<Przepelnienie> {
  return page.evaluate((limitRaportu) => {
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

    // Tylko te dwie wartosci obcinaja BEZ dawania przewijania. `auto`/`scroll`
    // oznaczaja "tresc jest, trzeba przewinac sekcje" — to defekt, nie alibi.
    const OBCINA = new Set(["hidden", "clip"]);

    /** Najblizszy przodek WEWNATRZ `body`, ktory obcina poziomo (albo `null`). */
    const przycinajacyPrzodek = (el: Element): Element | null => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        // PROBE: stan sprzed ISK-413 — kazda wartosc inna niz `visible`.
        if (
          !OBCINA.has("nigdy") &&
          getComputedStyle(node).overflowX !== "visible"
        )
          return node;
        node = node.parentElement;
      }
      return null;
    };

    /**
     * Ornament: nie ma go w drzewie dostepnosci i nie da sie go wskazac.
     * `closest` obejmuje tez sam element, wiec `aria-hidden` postawione
     * bezposrednio na poswiacie liczy sie tak samo jak na jej opakowaniu.
     */
    const ornament = (el: Element) => {
      const ozdoba =
        getComputedStyle(el).pointerEvents === "none" &&
        el.closest('[aria-hidden="true"]') !== null;
      // PROBE: stan sprzed ISK-413 — wyjatek nie pytal, czy to ozdoba.
      return ozdoba || el.tagName.length > 0;
    };

    const winowajcy: string[] = [];
    const zwolnieni: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      if (rect.right <= limit && rect.width <= limit) continue;

      const obcinajacy = przycinajacyPrzodek(el);
      if (obcinajacy && ornament(el)) {
        if (zwolnieni.length < limitRaportu) {
          zwolnieni.push(`${opis(el)} — obcinany przez ${opis(obcinajacy)}`);
        }
        continue;
      }

      winowajcy.push(
        `${sciezka(el)} — right=${Math.round(rect.right)}, width=${Math.round(
          rect.width,
        )}, kadr=${kadr}`,
      );
      if (winowajcy.length >= limitRaportu) break;
    }

    return {
      kadr,
      scrollWidth: document.documentElement.scrollWidth,
      winowajcy,
      zwolnieni,
    };
  }, LIMIT_RAPORTU);
}

/**
 * Oznacza KAZDY kontener przycinajacy poziomo atrybutem
 * `data-isk413-obcina="<i>"` i oddaje liste ich opisow.
 *
 * Drugie ramie nie dostaje listy selektorow na sztywno. Gdyby ja dostalo,
 * zestarzalaby sie po pierwszej zmianie arkusza i ramie przestaloby pokrywac
 * nowe poddrzewa, dalej swiecac na zielono. Przyklad z tego repozytorium:
 * `.ui-panel { overflow: hidden }` (`globals.css`) nie jest przypisana ZADNEMU
 * elementowi w `app/` ani `components/` — selektor z karty wskazywal na martwa
 * regule, a poddrzewo z `.home-hero-inner` nie bylo wymienione wcale.
 */
export async function oznaczKonteneryObcinajace(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const OBCINA = new Set(["hidden", "clip"]);
    const opis = (el: Element) => {
      const klasy = Array.from(el.classList).slice(0, 4).join(".");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
        klasy ? `.${klasy}` : ""
      }`;
    };

    const opisy: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      // TYLKO elementy HTML. `<svg>` ma w wyliczonym stylu `overflow-x: hidden`,
      // wiec trafial tu jako "kontener przycinajacy" — a wstrzyknietego `<div>`
      // nie uklada jako pudelka HTML (zerowa geometria), czyli ramie padalo na
      // wlasnym narzedziu, nie na defekcie produktu. Zmierzone w CI: trzy
      // czerwone testy z komunikatem „wstrzyknięty w svg NIE zostal zgloszony".
      if (!(el instanceof HTMLElement)) continue;
      if (!OBCINA.has(getComputedStyle(el).overflowX)) continue;
      const rect = el.getBoundingClientRect();
      // Kontener o zerowej geometrii nie moze niczego pokazac ani ukryc.
      if (rect.width === 0 || rect.height === 0) continue;
      el.setAttribute("data-isk413-obcina", String(opisy.length));
      opisy.push(opis(el));
    }
    return opisy;
  });
}

/**
 * Wstrzykuje do wskazanego kontenera element SZERSZY od kadru. `tresc` daje
 * element zwyczajny (ma byc zlapany), `ornament` — element z `aria-hidden`
 * i `pointer-events: none` (ma byc zwolniony).
 *
 * Oddaje tez ZMIERZONA geometrie wstrzyknietego elementu. Kontener, ktory nie
 * potrafi ulozyc pudelka HTML (element zastapiony w rodzaju `<img>`), oddaje
 * zerowa szerokosc — wolajacy ma wtedy ten kontener POMINAC, a nie zglaszac
 * jako slepote detektora. Bez tego pomiaru narzedzie myli „nie da sie tu nic
 * pokazac" z „detektor tego nie widzi".
 */
export async function wstrzyknijZaSzeroki(
  page: Page,
  opts: { indeks: number; rodzaj: "tresc" | "ornament" },
): Promise<{ id: string; width: number; height: number }> {
  return page.evaluate(({ indeks, rodzaj }) => {
    const host = document.querySelector(`[data-isk413-obcina="${indeks}"]`);
    if (!host) throw new Error(`brak kontenera o indeksie ${indeks}`);

    const el = document.createElement("div");
    const id = `isk413-${rodzaj}-${indeks}`;
    el.id = id;
    // Kadr + 200 px: z zapasem ponad `limit = kadr + 1`, zeby wynik nie zalezal
    // od zaokraglen subpikselowych.
    const szerokosc = document.documentElement.clientWidth + 200;
    // `flex: 0 0 auto` oraz `min-width` sa KONIECZNE, nie ozdobne: w kontenerze
    // `display: flex` goly `width` jest tylko baza, ktora `flex-shrink: 1`
    // sciska do rozmiaru rodzica — probka zmiescilaby sie w kadrze i ramie
    // zglosiloby slepote detektora tam, gdzie nie ma czego zglaszac.
    el.style.cssText = `flex:0 0 auto;min-width:${szerokosc}px;width:${szerokosc}px;height:40px;`;
    if (rodzaj === "ornament") {
      el.setAttribute("aria-hidden", "true");
      el.style.pointerEvents = "none";
    } else {
      // Element tresci: zostaje w drzewie dostepnosci i jest wskazywalny.
      el.textContent = "ISK-413 element kontrolny szerszy od kadru";
    }
    host.appendChild(el);

    const rect = el.getBoundingClientRect();
    return { id, width: rect.width, height: rect.height };
  }, opts);
}

/** Zdejmuje wstrzyknieta kontrolke; strona wraca do stanu produktu. */
export async function usunWstrzyknieta(page: Page, id: string): Promise<void> {
  await page.evaluate((wybrany) => {
    document.getElementById(wybrany)?.remove();
  }, id);
}
