import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

async function loadCatalog() {
  return import("@/lib/public-catalog");
}

describe("publiczny katalog bez konfiguracji Supabase", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of [...PUBLIC_KEYS, "NEXT_PHASE"]) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });

  it("w fazie builda zwraca pusty katalog zamiast zgadywać treści", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const catalog = await loadCatalog();

    await expect(catalog.getCategories()).resolves.toEqual([]);
    await expect(catalog.getTrainings()).resolves.toEqual([]);
    await expect(catalog.getTrainers()).resolves.toEqual([]);
    await expect(catalog.getTraining("wprowadzenie-do-ai")).resolves.toBeNull();
  });

  it("poza fazą builda zgłasza brak konfiguracji", async () => {
    const catalog = await loadCatalog();

    await expect(catalog.getTrainings()).rejects.toThrow(
      catalog.MISSING_PUBLIC_CONFIG,
    );
    await expect(catalog.getTrainers()).rejects.toThrow(
      catalog.MISSING_PUBLIC_CONFIG,
    );
  });
});
