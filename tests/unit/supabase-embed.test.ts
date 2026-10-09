import { describe, expect, it } from "vitest";

import { toOne } from "@/lib/supabase/embed";

describe("normalizacja relacji do-jednego z PostgREST", () => {
  it("zwraca obiekt, gdy PostgREST osadza relację jako obiekt", () => {
    expect(toOne({ name: "BHP" })).toEqual({ name: "BHP" });
  });

  it("zwraca pierwszy element, gdy typy opisują relację jako tablicę", () => {
    expect(toOne([{ name: "BHP" }])).toEqual({ name: "BHP" });
  });

  it("zwraca null dla pustej relacji", () => {
    expect(toOne([])).toBeNull();
    expect(toOne(null)).toBeNull();
    expect(toOne(undefined)).toBeNull();
  });
});
