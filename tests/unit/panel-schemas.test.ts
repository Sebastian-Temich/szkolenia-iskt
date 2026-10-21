import { describe, expect, it } from "vitest";

import { trainerSchema, trainingSchema } from "@/lib/panel/schemas";

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
   * „Najczęściej wybierane” na stronie głównej, `seo_*` — metadane strony,
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
