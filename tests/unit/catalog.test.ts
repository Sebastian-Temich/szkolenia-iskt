import { describe, expect, it } from "vitest";

import {
  describeTrainingCount,
  normalizeCatalogQuery,
  unaccentPl,
} from "@/lib/catalog";

describe("normalizeCatalogQuery", () => {
  it("odrzuca tablice i normalizuje pojedyncze wartości URL", () => {
    expect(
      normalizeCatalogQuery({
        category: " ai ",
        q: "  sztuczna   inteligencja  ",
        ignored: ["x"],
      }),
    ).toEqual({ category: "ai", q: "sztuczna inteligencja" });
  });

  it("ogranicza frazę wyszukiwania do 80 znaków", () => {
    expect(normalizeCatalogQuery({ q: "a".repeat(100) }).q).toHaveLength(80);
  });
});

describe("unaccentPl", () => {
  it("składa polskie znaki do ASCII tak jak slownik unaccent w bazie", () => {
    expect(unaccentPl("ąćęłńóśźż")).toBe("acelnoszz");
    expect(unaccentPl("ĄĆĘŁŃÓŚŹŻ")).toBe("ACELNOSZZ");
  });

  it("zamienia 'l' z kreska, ktorego NFD nie rozklada", () => {
    expect(unaccentPl("łąki")).toBe("laki");
    expect(unaccentPl("Łódź")).toBe("Lodz");
  });

  it("nie rusza tekstu bez diakrytykow", () => {
    expect(unaccentPl("zrownowazony rozwoj")).toBe("zrownowazony rozwoj");
  });

  it("zachowuje separatory frazy dla websearch_to_tsquery", () => {
    expect(unaccentPl('"język angielski" -podstawowy')).toBe(
      '"jezyk angielski" -podstawowy',
    );
  });
});

describe("describeTrainingCount", () => {
  it("odmienia liczebnik po polsku", () => {
    expect(describeTrainingCount(0)).toBe("0 szkoleń");
    expect(describeTrainingCount(1)).toBe("1 szkolenie");
    expect(describeTrainingCount(2)).toBe("2 szkolenia");
    expect(describeTrainingCount(4)).toBe("4 szkolenia");
    expect(describeTrainingCount(5)).toBe("5 szkoleń");
    expect(describeTrainingCount(12)).toBe("12 szkoleń");
    expect(describeTrainingCount(22)).toBe("22 szkolenia");
    expect(describeTrainingCount(25)).toBe("25 szkoleń");
  });
});
