import { describe, expect, it } from "vitest";

import { MAX_ALLOWED_LINKS, countLinks, isSuspectedSpam } from "@/lib/antispam/links";

describe("heurystyka linkow", () => {
  it("limit to 2 odnosniki", () => {
    expect(MAX_ALLOWED_LINKS).toBe(2);
  });

  it("liczy odnosniki http/https i www", () => {
    expect(countLinks("Zobacz https://a.pl oraz http://b.pl i www.c.pl")).toBe(3);
  });

  it("nie oznacza wiadomosci z maks. 2 odnosnikami", () => {
    expect(isSuspectedSpam("Oferta: https://a.pl i https://b.pl")).toBe(false);
  });

  it("oznacza wiadomosc z wiecej niz 2 odnosnikami", () => {
    expect(isSuspectedSpam("https://a.pl https://b.pl https://c.pl")).toBe(true);
  });

  it("nie oznacza zwyklej wiadomosci bez linkow", () => {
    expect(isSuspectedSpam("Prosze o kontakt telefoniczny w sprawie szkolenia.")).toBe(false);
  });
});
