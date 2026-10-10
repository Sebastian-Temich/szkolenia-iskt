import { describe, expect, it } from "vitest";

import {
  getAllowedInquiryTransitions,
  inquiryStatusSchema,
  isAllowedInquiryTransition,
} from "@/lib/panel/inquiry-status";

describe("cykl statusów zgłoszenia", () => {
  it("pozwala przejść z nowego zgłoszenia tylko do obsługi", () => {
    expect(getAllowedInquiryTransitions("nowe")).toEqual(["w_toku"]);
  });

  it("pozwala zamknąć zgłoszenie w toku", () => {
    expect(getAllowedInquiryTransitions("w_toku")).toEqual(["zamkniete"]);
  });

  it("nie pozwala ponownie zmieniać zamkniętego zgłoszenia", () => {
    expect(getAllowedInquiryTransitions("zamkniete")).toEqual([]);
  });

  it("odrzuca wartości spoza kontraktu bazy", () => {
    expect(inquiryStatusSchema.safeParse("usuniete").success).toBe(false);
  });
});

describe("egzekwowanie przejścia w Server Action", () => {
  it("dopuszcza wyłącznie kolejny krok cyklu", () => {
    expect(isAllowedInquiryTransition("nowe", "w_toku")).toBe(true);
    expect(isAllowedInquiryTransition("w_toku", "zamkniete")).toBe(true);
  });

  it("blokuje pominięcie kroku pośredniego", () => {
    expect(isAllowedInquiryTransition("nowe", "zamkniete")).toBe(false);
  });

  it("blokuje cofnięcie statusu", () => {
    expect(isAllowedInquiryTransition("w_toku", "nowe")).toBe(false);
    expect(isAllowedInquiryTransition("zamkniete", "w_toku")).toBe(false);
  });

  it("blokuje ustawienie tego samego statusu ponownie", () => {
    expect(isAllowedInquiryTransition("nowe", "nowe")).toBe(false);
    expect(isAllowedInquiryTransition("w_toku", "w_toku")).toBe(false);
    expect(isAllowedInquiryTransition("zamkniete", "zamkniete")).toBe(false);
  });
});
