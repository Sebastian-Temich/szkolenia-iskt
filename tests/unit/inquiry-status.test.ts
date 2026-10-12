import { describe, expect, it } from "vitest";

import {
  getAllowedInquiryTransitions,
  inquiryStatusSchema,
  isAllowedInquiryTransition,
} from "@/lib/panel/inquiry-status";

/**
 * Zbiór odniesienia: ADR-0003 (D7) i `model-danych.md` §3.6 — ten sam, który egzekwuje
 * trigger `enforce_inquiry_admin_update()` (pokryty w tests/integration/inquiry-triggers.test.ts
 * jako P4/N7). Poprzednia wersja tego pliku utrwalała węższy cykl panelu (ISK-374 BL-B),
 * więc bramka cementowała odstępstwo, zamiast je wyłapać. Lista jest zapisana wprost, żeby
 * rozjazd panelu z bazą wymagał świadomej zmiany tego testu.
 */
const ALLOWED: ReadonlyArray<[string, string]> = [
  ["nowe", "w_toku"],
  ["nowe", "zamkniete"],
  ["w_toku", "zamkniete"],
  ["zamkniete", "w_toku"],
];

describe("cykl statusów zgłoszenia", () => {
  it("z nowego zgłoszenia pozwala przejść do obsługi albo zamknąć je od razu", () => {
    expect(getAllowedInquiryTransitions("nowe")).toEqual([
      "w_toku",
      "zamkniete",
    ]);
  });

  it("pozwala zamknąć zgłoszenie w toku", () => {
    expect(getAllowedInquiryTransitions("w_toku")).toEqual(["zamkniete"]);
  });

  it("pozwala ponownie otworzyć zamknięte zgłoszenie", () => {
    expect(getAllowedInquiryTransitions("zamkniete")).toEqual(["w_toku"]);
  });

  it("odrzuca wartości spoza kontraktu bazy", () => {
    expect(inquiryStatusSchema.safeParse("usuniete").success).toBe(false);
  });
});

describe("egzekwowanie przejścia w Server Action", () => {
  it("dopuszcza dokładnie cztery przejścia zatwierdzone w ADR-0003", () => {
    const statuses = inquiryStatusSchema.options;
    for (const current of statuses) {
      for (const next of statuses) {
        const expected = ALLOWED.some(
          ([from, to]) => from === current && to === next,
        );
        expect(
          isAllowedInquiryTransition(current, next),
          `${current} -> ${next}`,
        ).toBe(expected);
      }
    }
  });

  it("pozwala zamknąć zgłoszenie bez przechodzenia przez „w toku”", () => {
    expect(isAllowedInquiryTransition("nowe", "zamkniete")).toBe(true);
  });

  it("pozwala wycofać zamknięcie, ale nie cofa zgłoszenia do „nowe”", () => {
    expect(isAllowedInquiryTransition("zamkniete", "w_toku")).toBe(true);
    expect(isAllowedInquiryTransition("w_toku", "nowe")).toBe(false);
    expect(isAllowedInquiryTransition("zamkniete", "nowe")).toBe(false);
  });

  it("blokuje ustawienie tego samego statusu ponownie", () => {
    expect(isAllowedInquiryTransition("nowe", "nowe")).toBe(false);
    expect(isAllowedInquiryTransition("w_toku", "w_toku")).toBe(false);
    expect(isAllowedInquiryTransition("zamkniete", "zamkniete")).toBe(false);
  });
});
