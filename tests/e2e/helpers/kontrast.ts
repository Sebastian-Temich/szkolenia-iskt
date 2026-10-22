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
 * zmierzona wartosc i miec ja w komunikacie bledu. Jest tez miejsce, w ktorym
 * jestesmy OSTRZEJSI od axe: nad gradientem axe oddaje `incomplete` zamiast
 * `violation` (bo nie wie, ktory piksel liczyc), a my liczymy kazdy stopien i
 * bierzemy najgorszy — patrz ISK-410.
 *
 * ISK-410: od tej wersji tlem jest takze `background-image`. Wczesniej liczyl
 * sie wylacznie `backgroundColor`, przez co kazda powierzchnia markowa
 * (`--gradient-brand`) byla niewidzialna dla pomiaru.
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
  /**
   * Tlo NAJGORSZEGO kandydata: wlasne albo zlozone z warstw przodkow, a przy
   * gradiencie ten jego stopien, na ktorym kontrast wychodzi najnizszy.
   */
  background: string;
  /** Najnizszy zmierzony stosunek kontrastu, zaokraglony do dwoch miejsc. */
  ratio: number;
  fontSizePx: number;
  fontWeight: number;
  /** Prog wymagany dla tego kroju: 3:1 dla duzego tekstu, inaczej 4,5:1. */
  required: number;
  width: number;
  height: number;
  /**
   * Ile tel rozwazono. >1 oznacza gradient — pole jest dowodem, ze kompozycja
   * `background-image` zadziala (patrz slepa plama nr 1 w ISK-410): test moze
   * zazadac, by pomiar na powierzchni markowej realnie widzial jej stopnie.
   */
  backgroundsConsidered: number;
  /**
   * Czy po drodze stal `background-image: url(...)`. Bitmapy ta arytmetyka nie
   * mierzy, wiec wynik jest wtedy niepewny i wolajacy musi to obsluzyc jawnie,
   * zamiast dostac cicho zanizona pewnosc.
   */
  rasterBackground: boolean;
  /**
   * Ile warstw `background-image` pominieto jako NIEPOKRYWAJACE elementu
   * (paski `no-repeat` o jawnym rozmiarze, np. cienie przewijania tabeli).
   * Pominiecie jest celowe — taka warstwa nie jest tlem tekstu w srodku
   * elementu — ale liczba jest w probce, zeby nie bylo to ciche.
   */
  partialBackgroundLayers: number;
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
       * ISK-410 / CR-B1 — slepa plama nr 1.
       *
       * Do tej pory czytalismy wylacznie `backgroundColor`. Element z
       * `background: var(--gradient-brand)` oddaje `backgroundColor:
       * rgba(0, 0, 0, 0)` (gradient siedzi w `background-image`), wiec obchod
       * MIJAL go i szedl do nastepnego nieprzezroczystego przodka — w praktyce
       * do bialego `body`. Kazda powierzchnia markowa byla wiec mierzona jako
       * "biel na bieli" albo "biel na stronie": gradient NIGDY nie byl tlem
       * porownania, a bramka raportowala wartosci z zupelnie innej sceny.
       *
       * Teraz z `background-image` wyciagamy wszystkie stopnie koloru i kazdy
       * traktujemy jako osobnego kandydata na tlo.
       */
      const COLOR_TOKEN =
        /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-fA-F]{3,8}/g;

      /**
       * Podzial wartosci wielowarstwowej na warstwy — po przecinkach NA
       * NAJWYZSZYM poziomie, bo `linear-gradient(...)` sam zawiera przecinki.
       */
      function splitLayers(value: string): string[] {
        const out: string[] = [];
        let depth = 0;
        let current = "";
        for (const char of value) {
          if (char === "(") depth += 1;
          else if (char === ")") depth -= 1;
          if (char === "," && depth === 0) {
            out.push(current.trim());
            current = "";
            continue;
          }
          current += char;
        }
        if (current.trim()) out.push(current.trim());
        return out;
      }

      /**
       * Czy warstwa POKRYWA caly element, czy tylko jego fragment.
       *
       * To nie jest ulatwienie bramki, tylko warunek poprawnosci. Opakowanie
       * tabeli panelu (`.panel-table-wrap`) maluje klasyczne "cienie
       * przewijania": cztery warstwy `no-repeat` o jawnym rozmiarze
       * (`3rem 100%`, `1rem 100%`) przyklejone do lewej i prawej krawedzi, a
       * pod nimi lite biale tlo. Traktowanie ciemnego stopnia takiej warstwy
       * (`rgb(23 31 20 / 0.2)`) jako tla CALEJ tabeli dawalo `rgb(209,210,208)`
       * i 4,2:1 na tekscie, ktory w rzeczywistosci lezy na bieli (5,9:1) —
       * zmierzony falszywy alarm, nie defekt produktu.
       *
       * Warstwa pokrywa element, gdy sie powtarza albo gdy jej rozmiar jest
       * pelnowymiarowy (`cover`, `100% 100%`, domyslne `auto` — gradient bez
       * podanego rozmiaru wypelnia pudelko). Pasek `no-repeat` o jawnym
       * rozmiarze nie pokrywa i nie jest kandydatem na tlo tekstu.
       */
      function layerCovers(repeat: string, size: string): boolean {
        const s = size.trim();
        if (s === "cover" || s === "100% 100%" || s.startsWith("auto"))
          return true;
        return repeat.trim() !== "no-repeat";
      }

      /**
       * Stopnie koloru z warstw `background-image`, ktore faktycznie pokrywaja
       * element. Pusta lista = brak gradientu do uwzglednienia.
       */
      function imageStops(style: CSSStyleDeclaration): {
        stops: Rgba[];
        partial: number;
      } {
        const image = style.backgroundImage;
        if (!image || image === "none") return { stops: [], partial: 0 };

        const warstwy = splitLayers(image);
        const powtorzenia = splitLayers(style.backgroundRepeat || "repeat");
        const rozmiary = splitLayers(style.backgroundSize || "auto");

        const stops: Rgba[] = [];
        let partial = 0;
        warstwy.forEach((warstwa, i) => {
          if (!warstwa || warstwa === "none") return;
          // Listy `repeat`/`size` cykluja sie wzgledem listy obrazow — tak
          // samo, jak robi to sama kaskada CSS.
          const repeat = powtorzenia[i % powtorzenia.length] ?? "repeat";
          const size = rozmiary[i % rozmiary.length] ?? "auto";
          if (!layerCovers(repeat, size)) {
            partial += 1;
            return;
          }
          for (const token of warstwa.match(COLOR_TOKEN) ?? []) {
            const parsed = parse(token);
            if (parsed) stops.push(parsed);
          }
        });
        return { stops, partial };
      }

      /**
       * Wszystkie tla, na ktorych tekst MOZE lezec. Gradient o N stopniach daje
       * N kandydatow; jednolity kolor — jednego.
       *
       * Karta ISK-410 mowi "przy gradiencie uzyj najciemniejszego stopnia jako
       * najgorszego przypadku". Realizujemy to SILNIEJ i inaczej, swiadomie:
       * najciemniejszy stopien jest najgorszy tylko dla tekstu CIEMNEGO. Dla
       * bialego tekstu na markowym gradiencie jest dokladnie odwrotnie — im
       * ciemniejsze tlo, tym kontrast WYZSZY, wiec reguła z karty wybralaby
       * przypadek najlepszy (green-900, 13,96:1) i przepuscila ten, ktory
       * faktycznie oblewa (green-500). Dlatego nie wybieramy stopnia po
       * jasnosci, tylko liczymy stosunek dla KAZDEGO i bierzemy minimum —
       * to jest najgorszy przypadek niezaleznie od koloru tekstu.
       */
      const MAX_CANDIDATES = 24;

      function backgroundCandidates(start: Element): {
        backgrounds: Rgba[];
        raster: boolean;
        partial: number;
      } {
        // Kazdy wariant to stos warstw, od elementu w gore.
        let stacks: Rgba[][] = [[]];
        let raster = false;
        let partial = 0;
        let node: Element | null = start;

        while (node) {
          const style = getComputedStyle(node);
          const image = style.backgroundImage;
          // Bitmapy nie da sie zmierzyc tym sposobem — zglaszamy to wywolujacemu
          // zamiast po cichu udawac, ze tla nie ma.
          if (image && image.includes("url(")) raster = true;

          const { stops, partial: pominiete } = imageStops(style);
          partial += pominiete;
          const color = parse(style.backgroundColor);

          // Kolejnosc malowania NA JEDNYM elemencie: najpierw `background-color`,
          // na to `background-image`. Listy ukladamy od gory, wiec stopien
          // gradientu idzie przed kolorem, a kolor dokladamy tylko wtedy, gdy
          // gradient go nie zakryje.
          const variants: Rgba[][] = [];
          if (stops.length > 0) {
            for (const stop of stops) {
              const layers: Rgba[] = [];
              if (stop[3] > 0) layers.push(stop);
              if (stop[3] < 1 && color && color[3] > 0) layers.push(color);
              variants.push(layers);
            }
          } else {
            variants.push(color && color[3] > 0 ? [color] : []);
          }

          const next: Rgba[][] = [];
          for (const stack of stacks) {
            for (const variant of variants) {
              next.push([...stack, ...variant]);
            }
          }
          stacks = next.slice(0, MAX_CANDIDATES);

          // Konczymy, gdy KAZDY wariant domyka sie warstwa nieprzezroczysta.
          const closed = variants.every(
            (layers) => layers.length > 0 && layers[layers.length - 1]![3] >= 1,
          );
          if (closed) break;
          node = node.parentElement;
        }

        // Brak nieprzezroczystej warstwy (np. przezroczysty `html`) to biel
        // kartki — tak samo robi przegladarka.
        const backgrounds = stacks.map((stack) => {
          let result: Rgba = [255, 255, 255, 1];
          for (let i = stack.length - 1; i >= 0; i--) {
            result = over(stack[i]!, result);
          }
          return result;
        });
        return { backgrounds, raster, partial };
      }

      return nodes
        .map((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const fg = parse(style.color) ?? [0, 0, 0, 1];
          const { backgrounds, raster, partial } = backgroundCandidates(node);

          // Najgorszy kandydat decyduje o ocenie calej powierzchni: tekst lezy
          // na calym gradiencie naraz, wiec zdac musi w kazdym jego punkcie.
          let worstBg = backgrounds[0]!;
          let worstFg: Rgba = fg[3] < 1 ? over(fg, worstBg) : fg;
          let worstRatio = ratio(worstFg, worstBg);
          for (const bg of backgrounds.slice(1)) {
            // Tekst polprzezroczysty widac przez swoje tlo — sklejamy tak samo,
            // osobno dla kazdego kandydata.
            const blended: Rgba = fg[3] < 1 ? over(fg, bg) : fg;
            const candidate = ratio(blended, bg);
            if (candidate < worstRatio) {
              worstRatio = candidate;
              worstBg = bg;
              worstFg = blended;
            }
          }

          const fontSizePx = Number.parseFloat(style.fontSize);
          const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
          // WCAG 2.1: "duzy tekst" to >=18.66px przy >=700 albo >=24px.
          const isLarge =
            fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

          return {
            text: (node.textContent ?? "").trim().slice(0, 48),
            foreground: `rgb(${worstFg.slice(0, 3).map(Math.round).join(", ")})`,
            background: `rgb(${worstBg.slice(0, 3).map(Math.round).join(", ")})`,
            ratio: Math.round(worstRatio * 100) / 100,
            fontSizePx,
            fontWeight,
            required: isLarge ? thresholds.large : thresholds.normal,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            backgroundsConsidered: backgrounds.length,
            rasterBackground: raster,
            partialBackgroundLayers: partial,
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
  // Przy gradiencie dopisujemy liczbe stopni — inaczej z komunikatu nie widac,
  // czy "tlo" to jedyny kolor elementu, czy najgorszy z kilku.
  const scena =
    sample.backgroundsConsidered > 1
      ? ` [najgorszy z ${sample.backgroundsConsidered} stopni tla]`
      : "";
  const bitmapa = sample.rasterBackground ? " [UWAGA: tlo bitmapowe]" : "";
  return `„${sample.text}”: ${sample.ratio}:1 (wymagane ${sample.required}:1; tekst ${sample.foreground} na ${sample.background}, ${sample.fontSizePx}px/${sample.fontWeight}, ${sample.width}x${sample.height} px)${scena}${bitmapa}`;
}
