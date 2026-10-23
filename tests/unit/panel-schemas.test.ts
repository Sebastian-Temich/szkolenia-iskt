import { describe, expect, it } from "vitest";

import {
  inquiryNoteSchema,
  trainerSchema,
  trainingSchema,
} from "@/lib/panel/schemas";

describe("schemat formularza trenera", () => {
  it("akceptuje pusty opcjonalny adres zdjęcia", () => {
    const result = trainerSchema.safeParse({
      full_name: "Anna Kowalska",
      slug: "anna-kowalska",
      headline: "Trenerka",
      bio: "",
      competences: "BHP, komunikacja",
      photo_url: "",
      sort_order: "100",
    });

    expect(result.success).toBe(true);
  });
});

describe("schemat formularza szkolenia", () => {
  const base = {
    title: "Bezpieczna praca",
    slug: "bezpieczna-praca",
    summary: "Praktyczne szkolenie dla zespołów.",
    category_id: "6f1a1f2e-0000-4000-8000-000000000001",
    level: "podstawowy",
    duration_hours: "8",
    price_net_pln: "1200",
    trainer_ids: [],
  };

  it("odrzuca szkolenie bez kategorii", () => {
    const result = trainingSchema.safeParse({ ...base, category_id: "" });

    expect(result.success).toBe(false);
  });

  /**
   * ISK-374 BL-C: te pola czyta publiczny frontend (`is_featured` — sekcja
   * „Szkolenia, które wyróżniamy” na stronie głównej, `seo_*` — metadane strony,
   * `learning_outcomes`/`target_audience` — strona szczegółu), a formularz panelu
   * ich nie obejmował. Test pilnuje, że pozostają w kontrakcie zapisu.
   */
  it("przyjmuje pola, od których zależy publiczny frontend", () => {
    const result = trainingSchema.safeParse({
      ...base,
      is_featured: true,
      seo_title: "Bezpieczna praca — szkolenie",
      seo_description: "Praktyczne szkolenie BHP dla zespołów technicznych.",
      learning_outcomes: "Ocena ryzyka\r\n  Procedury LOTO  \n\nRaportowanie\n",
      target_audience: "Zespoły techniczne",
      funding_note: "Możliwe dofinansowanie KFS",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      is_featured: true,
      seo_title: "Bezpieczna praca — szkolenie",
      target_audience: "Zespoły techniczne",
      funding_note: "Możliwe dofinansowanie KFS",
    });
    // Jedna pozycja w wierszu; puste wiersze i spacje nie tworzą pustych punktów.
    expect(result.data?.learning_outcomes).toEqual([
      "Ocena ryzyka",
      "Procedury LOTO",
      "Raportowanie",
    ]);
  });

  it("bez pól opcjonalnych daje wartości zgodne z kolumnami bazy", () => {
    const result = trainingSchema.safeParse(base);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      is_featured: false,
      seo_title: null,
      seo_description: null,
      target_audience: null,
      funding_note: null,
    });
    expect(result.data?.learning_outcomes).toEqual([]);
  });

  it("pilnuje limitów długości pól SEO wymuszonych w bazie", () => {
    expect(
      trainingSchema.safeParse({ ...base, seo_title: "x".repeat(71) }).success,
    ).toBe(false);
    expect(
      trainingSchema.safeParse({ ...base, seo_title: "x".repeat(70) }).success,
    ).toBe(true);
    expect(
      trainingSchema.safeParse({ ...base, seo_description: "x".repeat(161) })
        .success,
    ).toBe(false);
    expect(
      trainingSchema.safeParse({ ...base, seo_description: "x".repeat(160) })
        .success,
    ).toBe(true);
  });
});

/**
 * ISK-414: schemat doszedl w ISK-402 bez testu. Pilnujemy dwoch rzeczy, ktore
 * w zod 4 lamia sie po cichu:
 *
 *  - KOLEJNOSCI `.max()` → `.transform()`. Puste pole musi dac `null`, bo
 *    kolumna jest `nullable`; `.default("")` dolozony po transformacji
 *    zapisywalby pusty napis (znana pulapka: `.default()` podstawia WYNIK
 *    transformacji, wiec omija ja calkiem).
 *  - LIMITU 2000 znakow, ktory jest lustrem `check` z migracji 20261009120500.
 *    Bez niego administrator dostaje surowy `check_violation` z Postgresa
 *    zamiast komunikatu formularza.
 */
describe("schemat notatki wewnetrznej zgloszenia", () => {
  it("puste pole i same biale znaki zapisuja NULL, nie pusty napis", () => {
    expect(inquiryNoteSchema.parse("")).toBeNull();
    expect(inquiryNoteSchema.parse("   \n\t ")).toBeNull();
  });

  it("obcina biale znaki z brzegow, zachowujac tresc", () => {
    expect(inquiryNoteSchema.parse("  Telefon po 15:00  ")).toBe(
      "Telefon po 15:00",
    );
  });

  it("przyjmuje dokladnie 2000 znakow i odrzuca 2001", () => {
    expect(inquiryNoteSchema.parse("x".repeat(2000))).toHaveLength(2000);

    const tooLong = inquiryNoteSchema.safeParse("x".repeat(2001));
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe(
      "Notatka może mieć najwyżej 2000 znaków.",
    );
  });

  /**
   * Limit mierzy tresc PO obcieciu biali, tak jak zapisywana wartosc — inaczej
   * formularz odrzucalby notatke, ktora w bazie zmiescilaby sie bez problemu.
   */
  it("limit dotyczy tresci po obcieciu, nie surowego pola", () => {
    const padded = `  ${"x".repeat(2000)}  `;

    const result = inquiryNoteSchema.safeParse(padded);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2000);
  });

  it("nie przyjmuje wartosci, ktore nie sa tekstem", () => {
    expect(inquiryNoteSchema.safeParse(undefined).success).toBe(false);
    expect(inquiryNoteSchema.safeParse(null).success).toBe(false);
    expect(inquiryNoteSchema.safeParse(42).success).toBe(false);
  });
});
