/**
 * ISK-418 / F9 — pomiar WIDOCZNOSCI pierscienia focusu (WCAG 2.1 SC 1.4.11).
 *
 * Rodowod: funkcja wyrosla z `przejscieFocusem` z galezi `qa/isk-403-m4a`,
 * ktora wykryla klase F9. Tamta wersja mierzyla JEDNA warstwe pierscienia
 * (`outline` albo pierwszy `box-shadow`), bo taki wtedy byl pierscien.
 * Naprawa ISK-418 jest z koniecznosci DWUTONOWA — zaden pojedynczy kolor nie
 * daje 3:1 i wobec bieli, i wobec pasma `green-700` (patrz komentarz przy
 * `--focus-ring` w `app/globals.css`) — wiec pomiar musi umiec zlozyc caly
 * wskaznik, nie jego kawalek. Wersja jednowarstwowa oceniajaca nowy pierscien
 * zwrocilaby na stopce sam ciemny rdzen i zaraportowala 1,3:1 na wskazniku,
 * ktory czlowiek widzi jako wyrazna biala obwodke.
 *
 * CO DOKLADNIE JEST KRYTERIUM
 * Wskaznik zlozony z kilku tonow spelnia SC 1.4.11, gdy KTORYKOLWIEK z nich
 * ma >= 3:1 wobec tla przylegajacego — pozostale kontrastuja wtedy z nim.
 * Liczymy wiec kontrast KAZDEJ warstwy wobec tla otoczenia i bierzemy
 * najwyzszy. Kontrast tonow miedzy soba pilnuje osobno
 * `tests/unit/pierscien-focusu.test.ts`.
 *
 * DWIE PULAPKI POMIAROWE, OBIE JUZ RAZ DALY FALSZYWY WYNIK
 * 1. Kolory czytamy PLOTNEM 1x1, nie regexem. `getComputedStyle` oddaje
 *    `color-mix()` jako `color(srgb ...)` z kanalami 0..1, a naiwny parser
 *    czyta "1 1 1" jako 0..255 i prawie biale tlo wychodzi prawie czarne.
 * 2. Czekamy ponad czas przejscia. `.ui-field-control` ma
 *    `transition: box-shadow 130ms`, wiec odczyt w tej samej ramce, w ktorej
 *    padl Tab, lapie PIERWSZA KLATKE (`oklab(0 0 0 / 0) 0px 0px 0px 0px`) —
 *    alfa 0 i grubosc 0, czyli dokladnie to, co helper klasyfikuje jako brak
 *    pierscienia. Tak powstal falszywy wynik „12 pol bez focusu” w ISK-403.
 */
import type { Page } from "@playwright/test";

/** Prog dla elementow nietekstowych: WCAG 2.1 SC 1.4.11, poziom AA. */
export const PROG_1411 = 3;

/** Czas przejscia `--dur-fast` to 130 ms; czekamy z zapasem. */
const CZAS_PRZEJSCIA_MS = 220;

export type WarstwaPierscienia = {
  /** `outline` albo `box-shadow[n]` — zeby bylo wiadomo, co poprawiac. */
  zrodlo: string;
  /** Kolor po zlozeniu alfy z tlem otoczenia. */
  kolor: string;
  grubosc: number;
  kontrast: number;
};

export type PrzystanekFocusu = {
  indeks: number;
  selektor: string;
  tekst: string;
  /** Czy jakakolwiek warstwa ma niezerowa alfe i niezerowa grubosc. */
  maPierscien: boolean;
  tloOtoczenia: string;
  warstwy: WarstwaPierscienia[];
  /** Najwyzszy kontrast sposrod warstw — wartosc oceniana wobec progu. */
  kontrast: number;
  /**
   * Element, ktory FAKTYCZNIE rysuje pierscien. Rowny `selektor`, chyba ze
   * wskaznik niesie przodek — patrz `NOSNIK_WSKAZNIKA` nizej.
   */
  nosnik: string;
};

/**
 * Ile poziomow w gore szukamy nosnika wskaznika.
 *
 * Fokus nie zawsze siedzi na elemencie, ktory wskaznik RYSUJE. Przelacznik
 * segmentowy ma `input` rozciagniety na cala pastylke (`inset: 0`) i celowo
 * wygaszony (`outline: none; box-shadow: none`) — pierscien rysuje pastylka
 * przez `.ui-segmented-option:has(input:focus-visible)`. Pomiar patrzacy
 * wylacznie na `document.activeElement` raportuje tam „BRAK pierscienia”,
 * czyli defekt krytyczny, na wskazniku, ktory czlowiek widzi. Zmierzylem to
 * na harnessie czterech powierzchni, zanim bramka trafila do repozytorium.
 *
 * Dwa poziomy wystarczaja na wzorzec `label > input` i nie siegaja tak
 * wysoko, zeby zlapac przypadkowy cien sekcji i uznac go za wskaznik focusu.
 */
const NOSNIK_WSKAZNIKA_POZIOMY = 2;

/**
 * Przejscie klawiatura przez `liczbaTabow` kolejnych elementow z pomiarem
 * kontrastu pierscienia na kazdym przystanku.
 *
 * Zwraca przystanki w kolejnosci Tab. Przystanki, na ktorych focus wrocil na
 * `body` (koniec dokumentu, wyjscie do chromu przegladarki), sa pomijane.
 */
export async function przejscieFocusem(
  page: Page,
  liczbaTabow: number,
): Promise<PrzystanekFocusu[]> {
  const wynik: PrzystanekFocusu[] = [];

  for (let i = 0; i < liczbaTabow; i += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(CZAS_PRZEJSCIA_MS);

    const probka = await page.evaluate(
      ({ indeks, poziomy }) => {
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
          // Niepoprawna wartosc nie zmienia `fillStyle` — zostaje kolor zerowy
          // i warstwa jest traktowana jak nieobecna.
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
        function opis(c: Rgba): string {
          return `rgb(${c.slice(0, 3).map(Math.round).join(", ")})`;
        }

        /**
         * Tlo, na ktorym LEZY pierscien. Przy `outline-offset > 0` i przy
         * `box-shadow` o dodatnim rozlaniu pierscien jest POZA pudelkiem
         * elementu, wiec interesuje nas pierwsze nieprzezroczyste tlo PRZODKA,
         * nie tlo samego elementu.
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

        /**
         * Podzial `box-shadow` na warstwy po przecinkach NAJWYZSZEGO poziomu.
         * Naiwny `split(",")` rozrywa `rgb(18, 63, 20)` na trzy kawalki i caly
         * pomiar rozsypuje sie na kolorach zapisanych z przecinkami — a tak
         * wlasnie Chrome serializuje `box-shadow`.
         */
        function warstwyCienia(wartosc: string): string[] {
          const czesci: string[] = [];
          let glebokosc = 0;
          let biezaca = "";
          for (const znak of wartosc) {
            if (znak === "(") glebokosc += 1;
            if (znak === ")") glebokosc -= 1;
            if (znak === "," && glebokosc === 0) {
              czesci.push(biezaca.trim());
              biezaca = "";
              continue;
            }
            biezaca += znak;
          }
          if (biezaca.trim()) czesci.push(biezaca.trim());
          return czesci;
        }

        function sciezka(e: Element): string {
          let o = e.tagName.toLowerCase();
          if (e.id) return `${o}#${e.id}`;
          const klasy = (e.getAttribute("class") ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);
          if (klasy.length) o += `.${klasy.join(".")}`;
          return o;
        }

        /** Warstwy pierscienia rysowane przez KONKRETNY element. */
        function zmierzWarstwy(cel: Element, tlo: Rgba) {
          const st = getComputedStyle(cel);
          const surowe: Array<{
            zrodlo: string;
            kolor: string;
            grubosc: number;
          }> = [];

          const szerOutline = Number.parseFloat(st.outlineWidth) || 0;
          if (szerOutline > 0 && st.outlineStyle !== "none") {
            surowe.push({
              zrodlo: "outline",
              kolor: st.outlineColor,
              grubosc: szerOutline,
            });
          }

          if (st.boxShadow && st.boxShadow !== "none") {
            warstwyCienia(st.boxShadow).forEach((warstwa, n) => {
              // Cien wewnetrzny nie jest pierscieniem wokol elementu.
              if (/\binset\b/.test(warstwa)) return;
              // `oklab(...)` MUSI byc na liscie: tym zapisem Chrome serializuje
              // przezroczysty cien w trakcie przejscia. Bez tego wzorca kolor
              // wychodzi pusty i raport mowi „brak pierscienia” zamiast „cien
              // o zerowej alfie”.
              const mKolor = warstwa.match(
                /(color\([^)]*\)|rgba?\([^)]*\)|okla[bx]?\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]{3,8})/i,
              );
              const liczby = warstwa.match(/(-?\d+(?:\.\d+)?)px/g) ?? [];
              // `<kolor> 0px 0px 0px 3px` -> czwarta liczba to rozlanie, czyli
              // grubosc pierscienia.
              surowe.push({
                zrodlo: `box-shadow[${n}]`,
                kolor: mKolor ? mKolor[1]! : "",
                grubosc:
                  liczby.length >= 4
                    ? Math.abs(Number.parseFloat(liczby[3]!))
                    : 0,
              });
            });
          }

          return surowe
            .map((w) => {
              const kolor = parse(w.kolor);
              if (!kolor || kolor[3] === 0 || w.grubosc === 0) return null;
              // Warstwa polprzezroczysta — skladamy z tlem, na ktorym lezy.
              const zlozony = kolor[3] < 1 ? over(kolor, tlo) : kolor;
              return {
                zrodlo: w.zrodlo,
                kolor: opis(zlozony),
                grubosc: w.grubosc,
                kontrast: Math.round(kontrast(zlozony, tlo) * 100) / 100,
              };
            })
            .filter((w): w is NonNullable<typeof w> => w !== null);
        }

        // Fokus siedzi na `el`, ale wskaznik moze rysowac przodek (przelacznik
        // segmentowy). Szukamy PIERWSZEGO elementu, ktory cokolwiek rysuje —
        // i mierzymy go wobec JEGO otoczenia, bo tam ten pierscien lezy.
        let nosnik: Element = el;
        let tlo = tloOtoczenia(el);
        let warstwy = zmierzWarstwy(el, tlo);
        for (
          let poziom = 0;
          poziom < poziomy && warstwy.length === 0;
          poziom += 1
        ) {
          const rodzic = nosnik.parentElement;
          if (!rodzic) break;
          nosnik = rodzic;
          tlo = tloOtoczenia(nosnik);
          warstwy = zmierzWarstwy(nosnik, tlo);
        }

        return {
          indeks,
          selektor: sciezka(el),
          tekst: (el.textContent ?? "").trim().slice(0, 40),
          maPierscien: warstwy.length > 0,
          tloOtoczenia: opis(tlo),
          warstwy,
          kontrast: warstwy.reduce((max, w) => Math.max(max, w.kontrast), 0),
          nosnik: sciezka(nosnik),
        };
      },
      { indeks: i + 1, poziomy: NOSNIK_WSKAZNIKA_POZIOMY },
    );

    if (probka) wynik.push(probka);
  }
  return wynik;
}

/** Jednolinijkowy opis przystanku do komunikatu bledu. */
export function opisPrzystanku(p: PrzystanekFocusu): string {
  const gdzie =
    p.nosnik === p.selektor ? p.selektor : `${p.selektor} (rysuje ${p.nosnik})`;
  if (!p.maPierscien) {
    return `#${p.indeks} ${gdzie} „${p.tekst}”: BRAK pierscienia (tlo ${p.tloOtoczenia})`;
  }
  const warstwy = p.warstwy
    .map((w) => `${w.zrodlo} ${w.kolor} ${w.grubosc}px -> ${w.kontrast}:1`)
    .join("; ");
  return `#${p.indeks} ${gdzie} „${p.tekst}”: ${p.kontrast}:1 na tle ${p.tloOtoczenia} (${warstwy})`;
}
