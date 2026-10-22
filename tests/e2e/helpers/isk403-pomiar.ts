/**
 * ISK-403 / M4a — przyrzady pomiarowe dla QA wizualnego, responsywnego
 * i dostepnosciowego. Celowo osobny plik: te funkcje MIERZA i zwracaja liczby,
 * a decyzje o progach podejmuja spec-y. Dzieki temu raport zawiera zmierzone
 * wartosci, nie samo "przeszlo/nie przeszlo".
 */
import type { Page } from "@playwright/test";

/** Widoki mierzone na trzech szerokosciach. */
export const SZEROKOSCI = [360, 768, 1440] as const;

export type Widok = {
  /** Klucz do nazw plikow zrzutow i do raportu. */
  klucz: string;
  sciezka: string;
  /** Czy trasa wymaga zalogowanego administratora. */
  panel?: boolean;
  /** Krok wykonywany po wejsciu (np. rozwiniecie szczegolu zgloszenia). */
  przygotuj?: (page: Page) => Promise<void>;
};

/**
 * Elementy wychodzace poza viewport.
 *
 * NIE uzywamy `document.scrollWidth` — kontener glowny ma `overflow-x: hidden`,
 * wiec scrollWidth zawsze zwroci wartosc rowna szerokosci viewportu i kryterium
 * wyjdzie zielone niezaleznie od stanu layoutu (tym bledem zmierzono sam wzorzec
 * i zaraportowano go blednie jako responsywny). Mierzymy PRAWE KRAWEDZIE
 * faktycznych pudelek elementow potomnych.
 *
 * Filtrujemy przypadki, ktore nie sa defektem layoutu:
 *  - elementy niewidoczne (`display:none`, `visibility:hidden`, zerowa geometria,
 *    `opacity:0`) — nie ma ich na ekranie,
 *  - `.sr-only` i podobne (klip 1x1 poza ekranem) — technika dostepnosciowa,
 *  - potomkowie wlasnego kontenera z `overflow-x: auto/scroll` — tam przewijanie
 *    poziome jest zamierzone i lokalne (np. tabela panelu),
 *  - elementy poza ekranem w calosci po LEWEJ (zasuniete panele mobilne).
 */
export async function elementyPozaViewportem(
  page: Page,
  szerokoscViewportu: number,
  tolerancjaPx = 1,
): Promise<
  Array<{
    selektor: string;
    right: number;
    width: number;
    left: number;
    naddatek: number;
  }>
> {
  return page.evaluate(
    ({ vw, tol }) => {
      function sciezka(el: Element): string {
        const czesci: string[] = [];
        let node: Element | null = el;
        let glebokosc = 0;
        while (node && glebokosc < 4) {
          let opis = node.tagName.toLowerCase();
          if (node.id) {
            opis += `#${node.id}`;
            czesci.unshift(opis);
            break;
          }
          const klasy = (node.getAttribute("class") ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);
          if (klasy.length) opis += `.${klasy.join(".")}`;
          czesci.unshift(opis);
          node = node.parentElement;
          glebokosc += 1;
        }
        return czesci.join(" > ");
      }

      /** Czy ktorys przodek jest zamierzonym kontenerem przewijania w poziomie. */
      function wKontenerzePrzewijania(el: Element): boolean {
        let node: Element | null = el.parentElement;
        while (node && node !== document.documentElement) {
          const ox = getComputedStyle(node).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
          node = node.parentElement;
        }
        return false;
      }

      function widoczny(el: Element): boolean {
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return false;
        if (Number.parseFloat(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        // `.sr-only`: 1x1 z clip/clip-path, juz odciete warunkiem wyzej,
        // ale niektore implementacje daja width:1px height:auto.
        if (st.clipPath !== "none" && r.width <= 2) return false;
        return true;
      }

      const wynik: Array<{
        selektor: string;
        right: number;
        width: number;
        left: number;
        naddatek: number;
      }> = [];

      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (!widoczny(el)) continue;
        if (wKontenerzePrzewijania(el)) continue;
        const r = el.getBoundingClientRect();
        // Element w calosci po lewej stronie ekranu — zasuniety panel.
        if (r.right <= 0) continue;
        if (r.right > vw + tol) {
          wynik.push({
            selektor: sciezka(el),
            right: Math.round(r.right),
            width: Math.round(r.width),
            left: Math.round(r.left),
            naddatek: Math.round(r.right - vw),
          });
        }
      }
      return wynik;
    },
    { vw: szerokoscViewportu, tol: tolerancjaPx },
  );
}

/**
 * Siatki, ktorych ROZWINIETE `gridTemplateColumns` nie miesci sie w szerokosci
 * kontenera. `getComputedStyle` zwraca tu wartosci w px po rozwiazaniu `fr`,
 * `minmax()` i `auto-fit` — suma sciezek plus odstepy musi sie zmiescic.
 * Osobny pomiar od prawych krawedzi: siatka moze miescic sie wizualnie, bo
 * zawartosc jest wezsza, a nadal miec zadeklarowane za szerokie scizki (wtedy
 * pierwsza dluzsza tresc rozepnie layout).
 */
export async function siatkiPrzekraczajaceKontener(
  page: Page,
  tolerancjaPx = 1,
): Promise<
  Array<{
    selektor: string;
    kolumny: string;
    sumaKolumn: number;
    odstepy: number;
    szerokoscKontenera: number;
    naddatek: number;
  }>
> {
  return page.evaluate((tol) => {
    function sciezka(el: Element): string {
      let opis = el.tagName.toLowerCase();
      if (el.id) return `${opis}#${el.id}`;
      const klasy = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
      if (klasy.length) opis += `.${klasy.join(".")}`;
      return opis;
    }

    const wynik: Array<{
      selektor: string;
      kolumny: string;
      sumaKolumn: number;
      odstepy: number;
      szerokoscKontenera: number;
      naddatek: number;
    }> = [];

    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const st = getComputedStyle(el);
      if (st.display !== "grid" && st.display !== "inline-grid") continue;
      if (st.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;

      const surowe = st.gridTemplateColumns;
      if (!surowe || surowe === "none") continue;
      const sciezki = surowe
        .split(/\s+/)
        .map((v) => Number.parseFloat(v))
        .filter((v) => Number.isFinite(v));
      if (!sciezki.length) continue;

      const suma = sciezki.reduce((a, b) => a + b, 0);
      const gap = Number.parseFloat(st.columnGap) || 0;
      const odstepy = gap * Math.max(0, sciezki.length - 1);
      // Szerokosc dostepna w SRODKU kontenera (bez paddingu i obramowania).
      const padL = Number.parseFloat(st.paddingLeft) || 0;
      const padR = Number.parseFloat(st.paddingRight) || 0;
      const brdL = Number.parseFloat(st.borderLeftWidth) || 0;
      const brdR = Number.parseFloat(st.borderRightWidth) || 0;
      const dostepna = r.width - padL - padR - brdL - brdR;

      if (suma + odstepy > dostepna + tol) {
        wynik.push({
          selektor: sciezka(el),
          kolumny: surowe,
          sumaKolumn: Math.round(suma),
          odstepy: Math.round(odstepy),
          szerokoscKontenera: Math.round(dostepna),
          naddatek: Math.round(suma + odstepy - dostepna),
        });
      }
    }
    return wynik;
  }, tolerancjaPx);
}

/**
 * Hierarchia naglowkow: lista poziomow w kolejnosci dokumentu plus wykryte
 * przeskoki. Jeden `h1` i brak przeskokow to kryterium odbioru karty.
 */
export async function hierarchiaNaglowkow(page: Page): Promise<{
  poziomy: Array<{ poziom: number; tekst: string }>;
  liczbaH1: number;
  przeskoki: string[];
}> {
  return page.evaluate(() => {
    const naglowki = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    ).filter((el) => {
      const st = getComputedStyle(el);
      return st.display !== "none" && st.visibility !== "hidden";
    });
    const poziomy = naglowki.map((el) => ({
      poziom: Number.parseInt(el.tagName.slice(1), 10),
      tekst: (el.textContent ?? "").trim().slice(0, 60),
    }));
    const przeskoki: string[] = [];
    for (let i = 1; i < poziomy.length; i += 1) {
      const poprz = poziomy[i - 1]!;
      const biez = poziomy[i]!;
      if (biez.poziom > poprz.poziom + 1) {
        przeskoki.push(
          `h${poprz.poziom} („${poprz.tekst}”) -> h${biez.poziom} („${biez.tekst}”)`,
        );
      }
    }
    return {
      poziomy,
      liczbaH1: poziomy.filter((p) => p.poziom === 1).length,
      przeskoki,
    };
  });
}

/** Landmarki ARIA/HTML obecne w dokumencie. */
export async function landmarki(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "header, nav, main, footer, aside, [role=banner], [role=navigation], [role=main], [role=contentinfo], [role=complementary]",
      ),
    )
      .filter((el) => {
        const st = getComputedStyle(el);
        return st.display !== "none" && st.visibility !== "hidden";
      })
      .map((el) => {
        const rola = el.getAttribute("role") ?? el.tagName.toLowerCase();
        const nazwa =
          el.getAttribute("aria-label") ??
          (el.getAttribute("aria-labelledby")
            ? (document
                .getElementById(el.getAttribute("aria-labelledby")!)
                ?.textContent ?? "").trim()
            : "");
        return nazwa ? `${rola}[${nazwa.slice(0, 40)}]` : rola;
      }),
  );
}

/**
 * Cele dotykowe mniejsze niz 44x44 px (WCAG 2.1 AAA 2.5.5 / AA 2.5.8 w 2.2).
 * Karta wymaga >= 44x44, wiec mierzymy wszystkie elementy interaktywne.
 * Pomijamy linki w ciagu tekstu (inline) — dla nich kryterium nie ma
 * zastosowania, bo celem jest sam tekst akapitu.
 */
export async function maleCeleDotykowe(
  page: Page,
  minPx = 44,
): Promise<
  Array<{ selektor: string; tekst: string; width: number; height: number }>
> {
  return page.evaluate((min) => {
    function sciezka(el: Element): string {
      let opis = el.tagName.toLowerCase();
      if (el.id) return `${opis}#${el.id}`;
      const klasy = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
      if (klasy.length) opis += `.${klasy.join(".")}`;
      return opis;
    }

    const interaktywne = Array.from(
      document.querySelectorAll(
        "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [tabindex]:not([tabindex='-1'])",
      ),
    );

    return interaktywne
      .filter((el) => {
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        // Honeypot `#company_website` (ADR-0004 §3): `aria-hidden`, `tabindex=-1`
        // i `left:-9999px`. Nie jest celem dotykowym ZADNEGO uzytkownika, a bez
        // tego filtra wchodzil na liste "maly cel" na kazdym pomiarze /kontakt
        // jako pozorny defekt produktu. Odsiewamy wiec wszystko, co odebrane
        // dostepnosci i klawiaturze albo wyniesione poza plotno.
        if (el.closest("[aria-hidden='true']")) return false;
        if (el.getAttribute("tabindex") === "-1") return false;
        if (r.right <= 0 || r.bottom <= 0) return false;
        // Link w ciagu tekstu: rodzic jest blokiem tekstowym, a link nie jest
        // jedyna trescia. Kryterium celu dotykowego go nie obejmuje.
        if (el.tagName === "A") {
          const rodzic = el.parentElement;
          if (rodzic) {
            const dispRodzica = getComputedStyle(rodzic).display;
            const tekstRodzica = (rodzic.textContent ?? "").trim();
            const tekstLinku = (el.textContent ?? "").trim();
            const inlineKontekst =
              ["P", "LI", "SPAN", "SMALL", "DD", "DT", "LABEL"].includes(
                rodzic.tagName,
              ) || dispRodzica === "inline";
            if (inlineKontekst && tekstRodzica.length > tekstLinku.length) {
              return false;
            }
          }
        }
        return r.width < min || r.height < min;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          selektor: sciezka(el),
          tekst: (el.textContent ?? "").trim().slice(0, 40),
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        };
      });
  }, minPx);
}

/**
 * Przejscie klawiatura przez `liczbaTabow` kolejnych elementow z pomiarem
 * WIDOCZNOSCI pierscienia focusu.
 *
 * Dlaczego nie `toBeFocused()` / sprawdzenie `:focus-visible`: aplikacja ma
 * JEDEN globalny pierscien `color-mix(in srgb, green-500 55%, transparent)`
 * z `outline-offset: 2px`, wiec pierscien laduje na TLE OTOCZENIA elementu,
 * nie na samym elemencie. Na ciemnych powierzchniach (`.detail-aside`, stopka,
 * sekcje `--color-ink-900`) jego kontrast moze spasc ponizej progu 3:1
 * z WCAG 2.1 SC 1.4.11 (Non-text Contrast) i zaden dotychczasowy gate tego
 * nie mierzy. Liczymy wiec faktyczny kolor pierscienia po zlozeniu alfy
 * z tlem przodkow i jego kontrast wobec tego tla.
 *
 * Kolory czytamy PLOTNEM (canvas 1x1), nie regexem: `color-mix()` wraca
 * z `getComputedStyle` jako `color(srgb ...)` z kanalami 0..1, a naiwny parser
 * czyta "1 1 1" jako 0..255 i prawie biale tlo wychodzi prawie czarne.
 */
export async function przejscieFocusem(
  page: Page,
  liczbaTabow: number,
): Promise<
  Array<{
    indeks: number;
    selektor: string;
    tekst: string;
    maPierscien: boolean;
    kolorPierscienia: string;
    tloOtoczenia: string;
    kontrast: number;
    szerokoscPierscienia: number;
  }>
> {
  const wynik: Array<{
    indeks: number;
    selektor: string;
    tekst: string;
    maPierscien: boolean;
    kolorPierscienia: string;
    tloOtoczenia: string;
    kontrast: number;
    szerokoscPierscienia: number;
  }> = [];

  for (let i = 0; i < liczbaTabow; i += 1) {
    await page.keyboard.press("Tab");
    // `.ui-field-control` ma `transition: box-shadow 130ms`, a pierscien pol
    // formularza siedzi WLASNIE w `box-shadow`. Odczyt w tej samej ramce, w
    // ktorej padl Tab, lapie PIERWSZA KLATKE przejscia:
    // `oklab(0 0 0 / 0) 0px 0px 0px 0px` — alfa 0 i grubosc 0, czyli dokladnie
    // to, co helper (poprawnie) klasyfikuje jako "brak pierscienia". Tak
    // powstalo falszywe ustalenie "12 pol bez focusu" na /kontakt: pierscien
    // JEST, tylko jeszcze nie zdazyl sie pojawic. Czekamy wiec ponad czas
    // przejscia (--dur-fast = 130ms) i dopiero potem czytamy computed style.
    await page.waitForTimeout(220);
    const probka = await page.evaluate((indeks) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;

      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      type Rgba = [number, number, number, number];

      function parse(color: string): Rgba | null {
        if (!color) return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
      }
      function over(top: Rgba, bottom: Rgba): Rgba {
        const a = top[3];
        return [
          top[0] * a + bottom[0] * (1 - a),
          top[1] * a + bottom[1] * (1 - a),
          top[2] * a + bottom[2] * (1 - a),
          1,
        ];
      }
      function lum([r, g, b]: Rgba): number {
        const ch = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      }
      function kontrast(a: Rgba, b: Rgba): number {
        const [j, c] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (j! + 0.05) / (c! + 0.05);
      }
      /**
       * Tlo, na ktorym LEZY pierscien. Przy `outline-offset > 0` pierscien jest
       * poza pudelkiem elementu, wiec interesuje nas pierwsze nieprzezroczyste
       * tlo PRZODKA, a nie tlo samego elementu.
       */
      function tloOtoczenia(start: Element): Rgba {
        const warstwy: Rgba[] = [];
        let node: Element | null = start.parentElement;
        while (node) {
          const p = parse(getComputedStyle(node).backgroundColor);
          if (p && p[3] > 0) {
            warstwy.push(p);
            if (p[3] >= 1) break;
          }
          node = node.parentElement;
        }
        let out: Rgba = [255, 255, 255, 1];
        for (const w of warstwy.reverse()) out = over(w, out);
        return out;
      }
      function sciezka(e: Element): string {
        let opis = e.tagName.toLowerCase();
        if (e.id) return `${opis}#${e.id}`;
        const klasy = (e.getAttribute("class") ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2);
        if (klasy.length) opis += `.${klasy.join(".")}`;
        return opis;
      }

      const st = getComputedStyle(el);
      const tlo = tloOtoczenia(el);

      // Pierscien moze byc `outline` albo `box-shadow` (pola formularza maja
      // `outline: none` i pierscien w `box-shadow` — patrz `.ui-field-control`).
      const szerOutline = Number.parseFloat(st.outlineWidth) || 0;
      const outlineWidoczny = szerOutline > 0 && st.outlineStyle !== "none";
      const cien = st.boxShadow && st.boxShadow !== "none" ? st.boxShadow : "";

      let kolorSurowy = "";
      let szerokosc = 0;
      if (outlineWidoczny) {
        kolorSurowy = st.outlineColor;
        szerokosc = szerOutline;
      } else if (cien) {
        // Z `box-shadow` wyciagamy kolor wiodacy: `color(srgb ...)`, `rgb(...)`,
        // `rgba(...)` albo pierwszy token barwy. Szerokosc = promien rozlania.
        // `oklab(...)` MUSI byc na liscie: Chrome serializuje nim przezroczysty
        // cien w trakcie przejscia, a brak tego wzorca dawal kolor "" i raport
        // "<brak>" zamiast jawnej informacji o cieniu o zerowej alfie.
        const mKolor = cien.match(
          /(color\([^)]*\)|rgba?\([^)]*\)|okla[bx]?\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]{3,8})/i,
        );
        kolorSurowy = mKolor ? mKolor[1]! : "";
        const liczby = cien.match(/(-?\d+(?:\.\d+)?)px/g) ?? [];
        // `0 0 0 3px <kolor>` -> czwarta liczba to grubosc pierscienia.
        szerokosc = liczby.length >= 4 ? Math.abs(Number.parseFloat(liczby[3]!)) : 0;
      }

      const surowy = parse(kolorSurowy);
      if (!surowy || surowy[3] === 0 || szerokosc === 0) {
        return {
          indeks,
          selektor: sciezka(el),
          tekst: (el.textContent ?? "").trim().slice(0, 40),
          maPierscien: false,
          kolorPierscienia: kolorSurowy || "<brak>",
          tloOtoczenia: `rgb(${tlo.slice(0, 3).map(Math.round).join(", ")})`,
          kontrast: 0,
          szerokoscPierscienia: szerokosc,
        };
      }

      // Pierscien jest POLPRZEZROCZYSTY (55%) — skladamy go z tlem, na ktorym lezy.
      const zlozony = surowy[3] < 1 ? over(surowy, tlo) : surowy;
      return {
        indeks,
        selektor: sciezka(el),
        tekst: (el.textContent ?? "").trim().slice(0, 40),
        maPierscien: true,
        kolorPierscienia: `rgb(${zlozony.slice(0, 3).map(Math.round).join(", ")})`,
        tloOtoczenia: `rgb(${tlo.slice(0, 3).map(Math.round).join(", ")})`,
        kontrast: Math.round(kontrast(zlozony, tlo) * 100) / 100,
        szerokoscPierscienia: szerokosc,
      };
    }, i + 1);

    if (probka) wynik.push(probka);
  }
  return wynik;
}

/**
 * Faktycznie ZALADOWANE kroje pisma.
 *
 * `document.fonts.check("16px Inter")` zwraca `true` dla kroju, ktorego strona
 * nie zaladowala, jesli maszyna ma go zainstalowanego lokalnie — na maszynie
 * deweloperskiej z Interem w systemie taki pomiar jest bezwartosciowy.
 * Enumerujemy wiec `document.fonts` i patrzymy na `status === "loaded"`.
 */
export async function zaladowaneKroje(
  page: Page,
): Promise<Array<{ rodzina: string; waga: string; status: string }>> {
  return page.evaluate(() =>
    Array.from(document.fonts as unknown as Iterable<FontFace>).map((f) => ({
      rodzina: f.family,
      waga: f.weight,
      status: f.status,
    })),
  );
}
