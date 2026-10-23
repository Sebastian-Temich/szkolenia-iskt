/**
 * ISK-418 / F9 — bramka tokenow pierscienia focusu (WCAG 2.1 SC 1.4.11).
 *
 * DLACZEGO TA BRAMKA ISTNIEJE
 * Klasa F9 przezyla komplet zielonych bramek, bo zaden z nich nie mierzyl
 * wskaznika focusu: regula `color-contrast` w axe-core dotyczy TEKSTU, wiec
 * przebieg WCAG 2.1 AA na 45 pomiarach widokow dal zero naruszen przy
 * pierscieniu o kontrascie 1,45:1 na pasmie CTA. Bez wlasnego pomiaru klasa
 * wroci przy pierwszej zmianie palety.
 *
 * DLACZEGO TEST JEDNOSTKOWY, SKORO JEST TEZ E2E
 * `tests/e2e/pierscien-focusu.spec.ts` mierzy FAKTYCZNE przystanki Tab
 * w przegladarce i to on jest dowodem na produkt. Ale chodzi kilka minut,
 * wymaga stacku i mierzy wylacznie te powierzchnie, ktore akurat sa na
 * sciezce Tab. Ten test chodzi w milisekundy bez przegladarki i daje rzecz,
 * ktorej e2e dac nie moze: dowod dla DOWOLNEGO tla, takze takiego, ktorego
 * dzis w produkcie nie ma. Razem zamykaja i regresje palety, i regresje CSS.
 *
 * Czytamy `app/globals.css`, a nie stale przepisane do testu — test na
 * przepisanych wartosciach przechodzilby dalej po zmianie arkusza.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

/** Prog dla elementow NIETEKSTOWYCH: WCAG 2.1 SC 1.4.11, poziom AA. */
const PROG = 3;

type Rgb = [number, number, number];

/**
 * Wartosc deklaracji `--token:` z bloku `:root`. Bierzemy PIERWSZE
 * wystapienie — tokeny bazowe sa zadeklarowane raz, na gorze arkusza.
 */
function token(nazwa: string): string {
  const m = CSS.match(new RegExp(`--${nazwa}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`Brak tokenu --${nazwa} w app/globals.css`);
  return m[1]!.trim();
}

/**
 * Token rozwiniety do `#rrggbb`. Obsluguje jeden poziom `var(--inny-token)`,
 * bo tak wlasnie zapisane sa tokeny semantyczne (`--focus-ring:
 * var(--color-green-800)`). Swiadomie NIE obsluguje `color-mix()`: pierscien
 * polprzezroczysty jest dokladnie tym defektem, ktory ta karta zamyka, wiec
 * ma tu wybuchnac, a nie zostac po cichu zmierzony wobec zalozonego tla.
 */
function hexTokenu(nazwa: string): string {
  let wartosc = token(nazwa);
  const odwolanie = wartosc.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/i);
  if (odwolanie) wartosc = token(odwolanie[1]!);
  if (!/^#[0-9a-f]{6}$/i.test(wartosc)) {
    throw new Error(
      `--${nazwa} nie jest nieprzezroczystym kolorem #rrggbb, tylko „${wartosc}”. ` +
        `Pierscien polprzezroczysty (np. color-mix(... , transparent)) ma kolor ` +
        `zalezny od tla i to wlasnie byl defekt ISK-418.`,
    );
  }
  return wartosc.toLowerCase();
}

function rgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

/** Luminancja wzgledna wg WCAG 2.x. */
function luminancja([r, g, b]: Rgb): number {
  const kanal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}

/** Kontrast z dwoch luminancji — tlo opisujemy sama luminancja, bo kontrast
 *  WCAG od niczego innego nie zalezy. */
function kontrastL(a: number, b: number): number {
  const [jasna, ciemna] = a >= b ? [a, b] : [b, a];
  return (jasna + 0.05) / (ciemna + 0.05);
}

function zaokr(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Luminancje obu tonow liczone LENIWIE, w ciele testu. Gdyby staly na
 * poziomie modulu, powrot do polprzezroczystego tokenu wywracalby sie przy
 * imporcie i vitest raportowalby „no tests” zamiast nazwanego naruszenia —
 * czyli bramka padalaby poprawnie, ale nie mowilaby, co i gdzie jest zle.
 */
function tony(): { rdzen: number; obwodka: number } {
  return {
    rdzen: luminancja(rgb(hexTokenu("focus-ring"))),
    obwodka: luminancja(rgb(hexTokenu("focus-ring-contrast"))),
  };
}

/**
 * Pierscien jest DWUTONOWY, wiec jest widoczny, gdy KTORYKOLWIEK z tonow ma
 * >= 3:1 wobec tla. Tak samo czyta to „Understanding SC 1.4.11”: wskaznik
 * zlozony z dwoch kolorow spelnia kryterium, jesli jeden z nich kontrastuje
 * z tlem przylegajacym (drugi kontrastuje wtedy z pierwszym).
 */
function kontrastPierscienia(tlo: number): number {
  const { rdzen, obwodka } = tony();
  return Math.max(kontrastL(rdzen, tlo), kontrastL(obwodka, tlo));
}

/** Cztery rodziny powierzchni zmierzone w ISK-403/M4a — z ich wynikiem sprzed
 *  naprawy, zeby bylo widac, co dokladnie ten test pilnuje. */
const POWIERZCHNIE: Array<{ nazwa: string; tokenTla: string; przed: number }> =
  [
    { nazwa: "biel strony", tokenTla: "color-neutral-0", przed: 2.11 },
    {
      // Nie „stopka”: ta jest jasna od M2 (dwie reguly `.site-footer`, wygrywa
      // pozniejsza z `--color-surface-page`). Ciemne tlo `ink-900` niesie dzis
      // `.ui-card-dark` — m.in. karta dofinansowania na szczegole szkolenia.
      nazwa: "ink-900 (.ui-card-dark)",
      tokenTla: "color-ink-900",
      przed: 2.07,
    },
    {
      nazwa: "green-700 (pasmo CTA)",
      tokenTla: "color-green-700",
      przed: 1.45,
    },
    { nazwa: "green-50", tokenTla: "color-green-50", przed: 2.04 },
  ];

describe("ISK-418 — pierscien focusu, SC 1.4.11", () => {
  it("jest dwutonowy i nieprzezroczysty", () => {
    // Sam fakt, ze `hexTokenu` nie rzucil, dowodzi nieprzezroczystosci.
    expect(hexTokenu("focus-ring")).toMatch(/^#[0-9a-f]{6}$/);
    expect(hexTokenu("focus-ring-contrast")).toMatch(/^#[0-9a-f]{6}$/);
    // Dwa tony maja sens tylko wtedy, gdy kontrastuja ze SOBA — to one
    // niosa widocznosc wzajemnie, gdy tlo zje jeden z nich.
    const { rdzen, obwodka } = tony();
    expect(zaokr(kontrastL(rdzen, obwodka))).toBeGreaterThanOrEqual(PROG);
  });

  it.each(POWIERZCHNIE)(
    "ma >= 3:1 na powierzchni: $nazwa (przed naprawa $przed:1)",
    ({ tokenTla }) => {
      const tlo = luminancja(rgb(hexTokenu(tokenTla)));
      expect(zaokr(kontrastPierscienia(tlo))).toBeGreaterThanOrEqual(PROG);
    },
  );

  /**
   * Cztery rodziny to te powierzchnie, ktore akurat sa dzis w produkcie.
   * Kontrast zalezy WYLACZNIE od luminancji tla, wiec skan po L od 0 do 1
   * jest pelnym dowodem, a nie probkowaniem: pokrywa kazdy kolor, jaki
   * paleta moze kiedykolwiek przyjac. To ten warunek przesadzil o wyborze
   * `green-800` — `green-700` schodzi tu do 2,98:1.
   */
  it("ma >= 3:1 wobec DOWOLNEGO tla, nie tylko czterech rodzin", () => {
    let najgorszy = { kontrast: Number.POSITIVE_INFINITY, luminancjaTla: 0 };
    for (let i = 0; i <= 10_000; i += 1) {
      const tlo = i / 10_000;
      const k = kontrastPierscienia(tlo);
      if (k < najgorszy.kontrast) {
        najgorszy = { kontrast: k, luminancjaTla: tlo };
      }
    }
    expect(
      zaokr(najgorszy.kontrast),
      `najgorsze tlo ma luminancje ${zaokr(najgorszy.luminancjaTla)}`,
    ).toBeGreaterThanOrEqual(PROG);
  });

  /**
   * Wariant bledu pola ma wlasny rdzen (`--color-error-500`) i te sama biala
   * obwodke. Pola formularza stoja na bieli i na `green-50`, wiec tylko te
   * dwa tla sa dla niego w zasiegu — gwarancji „dowolne tlo” tu nie ma
   * i celowo jej nie udajemy.
   */
  it("wariant bledu ma >= 3:1 na tlach, na ktorych stoja pola", () => {
    const blad = luminancja(rgb(hexTokenu("color-error-500")));
    const { obwodka } = tony();
    for (const tokenTla of ["color-neutral-0", "color-green-50"]) {
      const tlo = luminancja(rgb(hexTokenu(tokenTla)));
      const k = Math.max(kontrastL(blad, tlo), kontrastL(obwodka, tlo));
      expect(zaokr(k)).toBeGreaterThanOrEqual(PROG);
    }
  });

  /**
   * Arkusz musi FAKTYCZNIE rysowac oba tony. Bez tego testu mozna usunac
   * `box-shadow` z reguly `:focus-visible`, zostawic tokeny i miec bramke
   * tokenow dalej zielona przy jednotonowym pierscieniu na ekranie.
   */
  it("rysuje obwodke wszedzie, gdzie rysuje rdzen", () => {
    // Skladniki, ktore rysuja WLASNY pierscien — kazdy musi niesc obwodke.
    // Obwodke globalna ma regula bezwarstwowa, sprawdzana osobno nizej.
    const reguly = [
      ".ui-field-control:focus-visible",
      '.ui-field-control[aria-invalid="true"]:focus-visible',
      ".ui-segmented .ui-segmented-option:has(input:focus-visible)",
    ];
    for (const selektor of reguly) {
      // Selektor musi stac na POCZATKU wiersza, inaczej `:focus-visible`
      // trafiloby w `.ui-field-control:focus-visible` i test mierzylby nie te
      // regule, co deklaruje.
      const indeks = CSS.indexOf(`\n  ${selektor} {`);
      expect(
        indeks,
        `brak reguly „${selektor}” w app/globals.css`,
      ).toBeGreaterThan(-1);
      const cialo = CSS.slice(indeks, CSS.indexOf("}", indeks));
      expect(cialo, `regula „${selektor}” nie rysuje bialej obwodki`).toContain(
        "--focus-ring-contrast",
      );
    }

    // Obwodka globalna: token domyslny + regula, ktora go maluje.
    expect(token("focus-ring-shadow")).toContain("--focus-ring-contrast");
    expect(
      CSS.slice(
        indeksRegulyGlobalnej(),
        CSS.indexOf("}", indeksRegulyGlobalnej()),
      ),
      "regula globalna nie maluje tokenu obwodki",
    ).toContain("--focus-ring-shadow");
  });

  /**
   * NAJWAZNIEJSZA ASERCJA W TYM PLIKU, I NAJMNIEJ OCZYWISTA.
   *
   * Obwodka musi byc malowana z reguly BEZ WARSTWY. Kaskada warstw rozstrzyga
   * PRZED specyficznoscia, wiec deklaracja `box-shadow` z `@layer base`
   * przegrywa z dowolnym skladnikiem z `@layer components`, ktory ma wlasny
   * cien spoczynkowy (`.ui-button-primary`, `.ui-button-light`, karty...).
   * Dokladnie tak zginela obwodka w pierwszej wersji tej karty: na jasnym tle
   * nic nie bylo widac, bo sam rdzen daje tam ~12:1, a na ciemnej karcie
   * `ink-900` zostawalo 1,54:1 przy progu 3:1.
   *
   * Przeniesienie tej reguly do jakiejkolwiek warstwy NIE zlamie zadnej
   * asercji na tokenach ani na jasnym tle — lapie je tylko ten test
   * i pomiar e2e na ciemnym tle. Dlatego stoi tu osobno i opisowo.
   */
  it("obwodka jest malowana spoza @layer (inaczej skladniki ja zabija)", () => {
    const indeks = indeksRegulyGlobalnej();
    expect(
      indeks,
      "brak bezwarstwowej reguly `:focus-visible` w app/globals.css",
    ).toBeGreaterThan(-1);

    // Komentarze wylatuja, zeby nawias w prozie nie zliczyl sie jako blok.
    const przed = CSS.slice(0, indeks).replace(/\/\*[\s\S]*?\*\//g, "");
    const glebokosc =
      (przed.match(/\{/g) ?? []).length - (przed.match(/\}/g) ?? []).length;
    expect(
      glebokosc,
      "regula obwodki wpadla do @layer — skladniki z wlasnym `box-shadow` " +
        "znow ja nadpisza (patrz komentarz nad regula w arkuszu)",
    ).toBe(0);
  });
});

/**
 * Pozycja bezwarstwowej reguly `:focus-visible`. Wymagamy POCZATKU wiersza bez
 * wciecia — w tym arkuszu wciecie dwoch spacji oznacza wnetrze `@layer`.
 */
function indeksRegulyGlobalnej(): number {
  return CSS.indexOf("\n:focus-visible {");
}
