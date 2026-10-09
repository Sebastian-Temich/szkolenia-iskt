import { describe, expect, it } from "vitest";

import {
  getAllowedInquiryTransitions,
  inquiryStatusSchema,
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
