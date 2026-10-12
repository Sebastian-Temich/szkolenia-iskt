/**
 * ISK-372 / B3 — pomiar kontrastu tekstu wobec FAKTYCZNEGO tla.
 *
 * Dlaczego osobny helper, a nie asercja "element jest widoczny": defekt B3
 * przezyl dwie naprawy (ISK-359, ISK-364) i zielony zestaw E2E, bo przycisk
 * istnial, mial poprawna nazwe dostepna i reagowal na klikniecie — brakowalo
 * mu wylacznie koloru. `toBeVisible()` tego nie widzi, `getByRole().click()`
 * tez nie.
 *
 * Dlaczego liczymy tlo przez przodkow: `getComputedStyle(el).backgroundColor`
 * dla przycisku z `background: none` zwraca `rgba(0, 0, 0, 0)`. Dokladnie tak
 * wygladal defekt — wlasne tlo zdjete, widac tlo strony. Zeby pomiar
 * odpowiadal temu, co widzi czlowiek, idziemy w gore drzewa do pierwszego
 * nieprzezroczystego tla i nakladamy po drodze warstwy polprzezroczyste.
 *
 * To ta sama arytmetyka, ktorej uzywa axe (`color-contrast`), tylko wywolana
 * punktowo: axe raportuje naruszenie dopiero przy progu, a tu chcemy znac
 * zmierzona wartosc i miec ja w komunikacie bledu.
 */
import type { Page } from "@playwright/test";

/**
 * Progi z WCAG 2.1, kryterium 1.4.3 (Contrast Minimum), poziom AA. Wybor
 * progu dla konkretnej probki robi `contrastSamples` (pole `required`), bo
 * zalezy od zmierzonego kroju — nie od decyzji wolajacego.
 */
const MIN_CONTRAST_NORMAL = 4.5;
const MIN_CONTRAST_LARGE = 3;

export type ContrastSample = {
  /** Tekst elementu — zeby komunikat bledu wskazywal konkretny przycisk. */
  text: string;
  /** `rgb(...)` tekstu, z `getComputedStyle`. */
  foreground: string;
  /** Tlo efektywne: wlasne albo zlozone z warstw przodkow. */
  background: string;
  /** Zmierzony stosunek kontrastu, zaokraglony do dwoch miejsc. */
  ratio: number;
  fontSizePx: number;
  fontWeight: number;
  /** Prog wymagany dla tego kroju: 3:1 dla duzego tekstu, inaczej 4,5:1. */
  required: number;
  width: number;
  height: number;
};

/**
 * Mierzy kontrast kazdego elementu pasujacego do selektora. Elementy o zerowej
 * geometrii pomijamy — nie sa widoczne, wiec nie podlegaja 1.4.3.
 */
export async function contrastSamples(
  page: Page,
  selector: string,
): Promise<ContrastSample[]> {
  // Progi ida argumentem, a nie przez domkniecie: funkcja nizej jest
  // serializowana i wykonywana w przegladarce, gdzie stale modulu nie istnieja.
  return page.$$eval(
    selector,
    (nodes, thresholds) => {
      type Rgba = [number, number, number, number];

      /**
       * Normalizacja koloru przez samo plotno, a nie wlasnym parserem regexem.
       *
       * `getComputedStyle` NIE zwraca zawsze `rgb()/rgba()`. Naglowek panelu ma
       * `background: color-mix(in srgb, white 94%, transparent)`, a przegladarka
       * oddaje to jako `color(srgb 1 1 1 / 0.94)` — kanaly w zakresie 0..1.
       * Naiwny regex czyta "1 1 1" jako 0..255 i prawie biale tlo wychodzi
       * prawie czarne (tak wlasnie zmierzylem 2,15:1 na linku "Wyloguj", ktory
       * w rzeczywistosci ma ~5,9:1). Rysujemy wiec kolor na przezroczystym
       * plotnie 1x1 i czytamy piksel: tlumaczenie kazdej skladni CSS (`color()`,
       * `oklch()`, `lab()`, `color-mix()`) robi silnik przegladarki.
       */
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      function parse(color: string): Rgba | null {
        if (!color) return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillStyle = color;
        // Niepoprawna wartosc nie zmienia `fillStyle` — zostaje nasz zerowy
        // kolor i probka jest traktowana jak brak tla.
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data as unknown as [
          number,
          number,
          number,
          number,
        ];
        return [r, g, b, a / 255];
      }

      /** Nalozenie warstwy `top` (z alfa) na nieprzezroczyste `bottom`. */
      function over(top: Rgba, bottom: Rgba): Rgba {
        const a = top[3];
        return [
          top[0] * a + bottom[0] * (1 - a),
          top[1] * a + bottom[1] * (1 - a),
          top[2] * a + bottom[2] * (1 - a),
          1,
        ];
      }

      function luminance([r, g, b]: Rgba): number {
        const channel = (value: number) => {
          const c = value / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      }

      function ratio(a: Rgba, b: Rgba): number {
        const [light, dark] = [luminance(a), luminance(b)].sort(
          (x, y) => y - x,
        );
        return (light! + 0.05) / (dark! + 0.05);
      }

      /**
       * Tlo efektywne: zbieramy warstwy od elementu w gore, az trafimy na
       * nieprzezroczysta. Brak takiej warstwy (np. przy przezroczystym `html`)
       * traktujemy jak biel kartki — tak samo robi przegladarka.
       */
      function effectiveBackground(start: Element): Rgba {
        const layers: Rgba[] = [];
        let node: Element | null = start;
        while (node) {
          const parsed = parse(getComputedStyle(node).backgroundColor);
          if (parsed && parsed[3] > 0) {
            layers.push(parsed);
            if (parsed[3] >= 1) break;
          }
          node = node.parentElement;
        }
        let result: Rgba = [255, 255, 255, 1];
        for (const layer of layers.reverse()) {
          result = over(layer, result);
        }
        return result;
      }

      return nodes
        .map((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const fg = parse(style.color) ?? [0, 0, 0, 1];
          const bg = effectiveBackground(node);
          // Tekst polprzezroczysty widac przez swoje tlo — sklejamy tak samo.
          const blendedFg: Rgba = fg[3] < 1 ? over(fg, bg) : fg;

          const fontSizePx = Number.parseFloat(style.fontSize);
          const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
          // WCAG 2.1: "duzy tekst" to >=18.66px przy >=700 albo >=24px.
          const isLarge =
            fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

          return {
            text: (node.textContent ?? "").trim().slice(0, 48),
            foreground: `rgb(${blendedFg.slice(0, 3).map(Math.round).join(", ")})`,
            background: `rgb(${bg.slice(0, 3).map(Math.round).join(", ")})`,
            ratio: Math.round(ratio(blendedFg, bg) * 100) / 100,
            fontSizePx,
            fontWeight,
            required: isLarge ? thresholds.large : thresholds.normal,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((sample) => sample.width > 0 && sample.height > 0);
    },
    { large: MIN_CONTRAST_LARGE, normal: MIN_CONTRAST_NORMAL },
  );
}

/**
 * Alfa WLASNEGO tla elementu (0 = tlo zdjete, widac przodka). Osobna asercja
 * od kontrastu: pilnuje samego mechanizmu defektu B3, czyli `background: none`
 * przebijajacego `background: var(--color-primary)`. Czytana przez plotno, bo
 * `backgroundColor` moze przyjsc jako `color(srgb ... / a)`.
 */
export async function backgroundAlpha(
  page: Page,
  selector: string,
): Promise<number> {
  return page.$eval(selector, (node) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillStyle = getComputedStyle(node).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[3]! / 255;
  });
}

/** Jednolinijkowy opis probki do komunikatu bledu. */
export function formatSample(sample: ContrastSample): string {
  return `„${sample.text}”: ${sample.ratio}:1 (wymagane ${sample.required}:1; tekst ${sample.foreground} na ${sample.background}, ${sample.fontSizePx}px/${sample.fontWeight}, ${sample.width}x${sample.height} px)`;
}
