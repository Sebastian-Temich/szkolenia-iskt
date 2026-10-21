/**
 * ISK-400 — zestaw ikon bundlowany w repozytorium.
 *
 * Renderujemy przez `react-dom/server`, bo repozytorium nie ma jsdom ani RTL,
 * a projekt `unit` to `environment: "node"` i wylacznie pliki `.test.ts`
 * (`vitest.config.ts`). Dlatego elementy skladamy `createElement`, nie JSX.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Icon } from "@/components/ui/icon";
import {
  ICON_NAMES,
  ICON_SHAPES,
  type IconName,
  type IconShape,
} from "@/components/ui/icon-shapes";

/**
 * `ICON_SHAPES` jest `as const`, wiec TypeScript zna literalne dlugosci list
 * i literalne wspolrzedne — porownanie `length === 0` albo `x1 !== x2` byloby
 * wtedy bledem "porownanie bez pokrycia typow", a nie asercja. Szeroki typ
 * sprowadza plik do tego, czym jest w runtime: danych do sprawdzenia.
 */
const KSZTALTY: Readonly<Record<IconName, readonly IconShape[]>> = ICON_SHAPES;

/** Zestaw publiczny wymagany przez ISK-400 punkt 3 — dokladnie te 29 nazw. */
const WYMAGANE_PUBLICZNE = [
  "arrow-right",
  "arrow-left",
  "check",
  "cpu",
  "leaf",
  "languages",
  "code-xml",
  "flask-conical",
  "graduation-cap",
  "building-2",
  "clock",
  "monitor",
  "gauge",
  "calendar",
  "search",
  "clipboard-list",
  "book-open",
  "award",
  "target",
  "layers",
  "handshake",
  "trending-up",
  "banknote",
  "wallet",
  "shield-check",
  "mail",
  "phone",
  "map-pin",
  "lock",
] as const;

describe("ISK-400 — kompletnosc zestawu ikon", () => {
  it("zawiera wszystkie 29 ikon z listy na karcie", () => {
    const brakujace = WYMAGANE_PUBLICZNE.filter((name) => !(name in KSZTALTY));
    expect(
      brakujace,
      `Brak ikon w zestawie: ${brakujace.join(", ")}`,
    ).toStrictEqual([]);
    // Kontrapunkt: lista wymagan nie jest pusta i naprawde ma 29 pozycji,
    // wiec test powyzej nie jest spelniony trywialnie.
    expect(WYMAGANE_PUBLICZNE).toHaveLength(29);
  });

  it("zadna ikona nie jest pusta", () => {
    const puste = ICON_NAMES.filter((name) => KSZTALTY[name].length === 0);
    expect(puste, `Ikony bez ksztaltow: ${puste.join(", ")}`).toStrictEqual([]);
  });

  it("kazdy ksztalt ma wspolrzedne swojego typu", () => {
    // Plik jest generowany; ta asercja wylapuje bledny generator, nie literowke.
    for (const name of ICON_NAMES) {
      for (const s of KSZTALTY[name]) {
        if (s.tag === "path") expect(s.d.length, name).toBeGreaterThan(0);
        if (s.tag === "circle") expect(s.r, name).toBeGreaterThan(0);
        if (s.tag === "rect") expect(s.width, name).toBeGreaterThan(0);
        if (s.tag === "line")
          expect(s.x1 !== s.x2 || s.y1 !== s.y2, name).toBe(true);
      }
    }
  });
});

describe("ISK-400 — Icon: geometria i dostepnosc", () => {
  it("rysuje viewBox 24 i kreske 2 niezaleznie od rozmiaru", () => {
    const maly = renderToStaticMarkup(
      createElement(Icon, { name: "leaf", size: 14 }),
    );
    const duzy = renderToStaticMarkup(
      createElement(Icon, { name: "leaf", size: 28 }),
    );

    for (const html of [maly, duzy]) {
      expect(html).toContain('viewBox="0 0 24 24"');
      // Sedno: grubosc kreski NIE skaluje sie z rozmiarem — tak jak we wzorcu,
      // ktory pobieral surowe pliki Lucide i podmienial tylko width/height.
      expect(html).toContain('stroke-width="2"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('fill="none"');
    }
    expect(maly).toContain('width="14"');
    expect(duzy).toContain('width="28"');
  });

  it("bez etykiety jest ukryta przed czytnikiem ekranu", () => {
    const html = renderToStaticMarkup(
      createElement(Icon, { name: "clock", size: 16 }),
    );
    // Forma dokladna: atrybut boolean renderuje sie jako `aria-hidden="true"`.
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("aria-label");
    // `focusable="false"` trzyma SVG poza kolejnoscia Tab w starszym Edge.
    expect(html).toContain('focusable="false"');
  });

  it("z etykieta staje sie obrazem o nazwie, a nie tooltipem", () => {
    const html = renderToStaticMarkup(
      createElement(Icon, {
        name: "lock",
        size: 24,
        label: "Tylko dla zalogowanych",
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Tylko dla zalogowanych"');
    expect(html).not.toContain("aria-hidden");
    // Wzorzec opisuje ikony `title`, czego klawiatura nie pokazuje nigdy —
    // tego nie odtwarzamy (ISK-399 / M1 punkt 5).
    expect(html).not.toContain("<title");
  });

  it("nie uzywa dangerouslySetInnerHTML — sklada elementy", () => {
    const html = renderToStaticMarkup(
      createElement(Icon, { name: "cpu", size: 20 }),
    );
    // `cpu` ma w zestawie i `path`, i `rect`: gdyby render szedl napisem HTML,
    // elementy nie mialyby formy serializowanej przez Reacta.
    expect(html).toContain("<path");
    expect(html).toContain("<rect");
    expect(html.startsWith("<svg")).toBe(true);
  });
});
