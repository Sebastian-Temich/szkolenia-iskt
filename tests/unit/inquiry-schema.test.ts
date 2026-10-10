import { describe, expect, it } from "vitest";

import { inquirySchema } from "@/lib/validation/inquiry";

const base = {
  kind: "osoba" as const,
  fullName: "Jan Kowalski",
  email: "Jan.Kowalski@Example.COM",
  phone: "+48 600 100 200",
  interestArea: "Szkolenia BHP",
  message: "Dzien dobry, prosze o kontakt w sprawie szkolenia dla zespolu.",
  rodoAck: true as const,
  rodoClauseVersion: "DRAFT-1",
};

describe("inquirySchema — pola i normalizacja", () => {
  it("przyjmuje poprawne zgloszenie osoby i normalizuje e-mail do malych liter", () => {
    const result = inquirySchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jan.kowalski@example.com");
      expect(result.data.fullName).toBe("Jan Kowalski");
    }
  });

  it("przycina biale znaki w imieniu i nazwisku", () => {
    const result = inquirySchema.safeParse({ ...base, fullName: "  Anna Nowak  " });
    expect(result.success && result.data.fullName).toBe("Anna Nowak");
  });

  it("odrzuca zbyt krotkie imie i nazwisko", () => {
    const result = inquirySchema.safeParse({ ...base, fullName: "A" });
    expect(result.success).toBe(false);
  });

  it("odrzuca niepoprawny adres e-mail", () => {
    expect(inquirySchema.safeParse({ ...base, email: "nie-email" }).success).toBe(false);
  });

  it("odrzuca e-mail dluzszy niz 254 znaki", () => {
    const long = `${"a".repeat(250)}@ex.pl`;
    expect(inquirySchema.safeParse({ ...base, email: long }).success).toBe(false);
  });

  it("odrzuca telefon z niedozwolonymi znakami", () => {
    expect(inquirySchema.safeParse({ ...base, phone: "600abc200" }).success).toBe(false);
  });

  it("odrzuca zbyt krotki telefon", () => {
    expect(inquirySchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
  });

  it("odrzuca wiadomosc krotsza niz 10 znakow", () => {
    expect(inquirySchema.safeParse({ ...base, message: "za malo" }).success).toBe(false);
  });

  it("odrzuca wiadomosc dluzsza niz 2000 znakow", () => {
    expect(inquirySchema.safeParse({ ...base, message: "x".repeat(2001) }).success).toBe(false);
  });

  it("odrzuca znaki sterujace w wiadomosci", () => {
    const withControlChar = `Tresc z bajtem ${String.fromCharCode(7)} sterujacym kontrolnym.`;
    expect(inquirySchema.safeParse({ ...base, message: withControlChar }).success).toBe(false);
  });
});

describe("inquirySchema — zgoda RODO", () => {
  it("odrzuca brak zgody RODO (false)", () => {
    const result = inquirySchema.safeParse({ ...base, rodoAck: false });
    expect(result.success).toBe(false);
  });

  it("odrzuca brak zgody RODO (undefined)", () => {
    const withoutAck: Record<string, unknown> = { ...base };
    delete withoutAck.rodoAck;
    expect(inquirySchema.safeParse(withoutAck).success).toBe(false);
  });

  it("wymaga wersji klauzuli RODO", () => {
    expect(inquirySchema.safeParse({ ...base, rodoClauseVersion: "" }).success).toBe(false);
  });
});

describe("inquirySchema — warianty osoba/firma", () => {
  it("odrzuca firme bez nazwy", () => {
    const result = inquirySchema.safeParse({ ...base, kind: "firma", companyName: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("companyName"))).toBe(true);
    }
  });

  it("przyjmuje firme z nazwa", () => {
    const result = inquirySchema.safeParse({
      ...base,
      kind: "firma",
      companyName: "ACME sp. z o.o.",
    });
    expect(result.success).toBe(true);
  });

  it("nie wymaga nazwy firmy dla osoby indywidualnej", () => {
    expect(inquirySchema.safeParse(base).success).toBe(true);
  });
});

describe("inquirySchema — temat zgloszenia", () => {
  it("odrzuca brak szkolenia i obszaru jednoczesnie", () => {
    const withoutSubject: Record<string, unknown> = { ...base };
    delete withoutSubject.interestArea;
    const result = inquirySchema.safeParse(withoutSubject);
    expect(result.success).toBe(false);
  });

  it("przyjmuje zgloszenie z samym trainingId", () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.interestArea;
    const result = inquirySchema.safeParse({
      ...rest,
      trainingId: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("odrzuca niepoprawny trainingId (nie-UUID)", () => {
    expect(inquirySchema.safeParse({ ...base, trainingId: "not-a-uuid" }).success).toBe(false);
  });
});
