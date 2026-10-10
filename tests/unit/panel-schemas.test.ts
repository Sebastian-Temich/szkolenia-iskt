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
  it("odrzuca szkolenie bez kategorii", () => {
    const result = trainingSchema.safeParse({
      title: "Bezpieczna praca",
      slug: "bezpieczna-praca",
      summary: "Praktyczne szkolenie dla zespołów.",
      category_id: "",
      level: "podstawowy",
      duration_hours: "8",
      price_net_pln: "1200",
      trainer_ids: [],
    });

    expect(result.success).toBe(false);
  });
});
