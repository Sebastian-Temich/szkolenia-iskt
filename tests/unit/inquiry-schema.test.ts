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

  it("ignoruje wersje klauzuli RODO z ciala zadania (ustala ja serwer — ISK-357 T3)", () => {
    const result = inquirySchema.safeParse({ ...base, rodoClauseVersion: "v9-nieistniejaca" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("rodoClauseVersion" in result.data).toBe(false);
    }
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

describe("inquirySchema — wstrzykniecie naglowka e-mail CR/LF (ISK-370)", () => {
  // Temat powiadomienia (ADR-0004 §5) powstaje z `fullName`/`companyName`; `phone`/`interestArea`
  // sa polami jednoliniowymi zapisywanymi i przekazywanymi do warstwy poczty. Zadne z tych pol nie
  // moze zawierac CR/LF, bo pozwolilyby dopisac wlasny naglowek wiadomosci (np. `Bcc:`).
  const SINGLE_LINE_FIELDS = ["fullName", "companyName", "phone", "interestArea"] as const;
  const PAYLOADS: Record<(typeof SINGLE_LINE_FIELDS)[number], string> = {
    fullName: "Jan Kowalski",
    companyName: "ACME sp. z o.o.",
    phone: "+48 600 100 200",
    interestArea: "Szkolenia BHP",
  };

  // Pozycja brzegowa (poczatek/koniec) jest kluczowa: `.trim()` usunelby CR/LF z brzegow przed
  // sprawdzeniem, wiec walidacja CR/LF musi dzialac na SUROWEJ wartosci (ISK-370, regresja S3).
  const SEPARATORS = [
    ["CR", "\r"],
    ["LF", "\n"],
    ["CRLF", "\r\n"],
  ] as const;

  for (const field of SINGLE_LINE_FIELDS) {
    for (const [name, sep] of SEPARATORS) {
      const variants = {
        poczatku: `${sep}Bcc: evil@example.com ${PAYLOADS[field]}`,
        srodku: `${PAYLOADS[field]}${sep}Bcc: evil@example.com`,
        koncu: `${PAYLOADS[field]}${sep}`,
      } as const;
      for (const [position, injected] of Object.entries(variants)) {
        it(`odrzuca ${name} na ${position} pola ${field}`, () => {
          const result = inquirySchema.safeParse({ ...base, kind: "firma", [field]: injected });
          expect(result.success).toBe(false);
        });
      }
    }
  }

  it("nadal przyjmuje poprawne pola jednoliniowe (kontrapunkt)", () => {
    const result = inquirySchema.safeParse({
      ...base,
      kind: "firma",
      companyName: "ACME sp. z o.o.",
    });
    expect(result.success).toBe(true);
  });
});

describe("inquirySchema — warunkowe pola w JEDNYM przebiegu (ISK-382)", () => {
  // Zbiera sciezki bledow z jednego `safeParse` — DoD wymaga liczenia `issues` po `path`,
  // nie samego `success === false`, bo defekt polegal na BRAKUJACEJ sciezce przy pierwszej
  // wysylce, nie na przejsciu walidacji.
  const errorPaths = (input: unknown): string[] => {
    const result = inquirySchema.safeParse(input);
    if (result.success) return [];
    return [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].sort();
  };

  // Odpowiada `defaultValues` z `app/(public)/kontakt/inquiry-form.tsx`: przegladarka nie wysyla
  // `undefined`, tylko puste stringi i `rodoAck: false`. To ten ksztalt decydowal o defekcie —
  // `z.literal(true)` dawalo blad przerywajacy, ktory wycinal `superRefine`.
  const emptyForm = {
    kind: "osoba",
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
    interestArea: "",
    message: "",
    rodoAck: false,
  } as const;

  it("pusty formularz (ksztalt z przegladarki) oznacza takze interestArea — bez drugiej wysylki", () => {
    expect(errorPaths(emptyForm)).toEqual([
      "email",
      "fullName",
      "interestArea",
      "message",
      "phone",
      "rodoAck",
    ]);
  });

  it("pusty obiekt oznacza wszystkie wymagane pola razem z warunkowym interestArea", () => {
    const paths = errorPaths({});
    expect(paths).toContain("interestArea");
    expect(paths).toEqual(
      expect.arrayContaining(["kind", "fullName", "email", "phone", "message", "rodoAck"]),
    );
  });

  it("pusty formularz firmowy oznacza companyName razem z bledami ksztaltu", () => {
    const paths = errorPaths({ ...emptyForm, kind: "firma" });
    expect(paths).toContain("companyName");
    expect(paths).toContain("interestArea");
    expect(paths).toContain("rodoAck");
  });

  it("brak samej zgody RODO nie odklada bledu interestArea na kolejna wysylke", () => {
    const paths = errorPaths({
      ...emptyForm,
      fullName: "Jan Kowalski",
      email: "jan@example.com",
      phone: "+48 600 100 200",
      message: "Dzien dobry, prosze o kontakt w sprawie szkolenia dla zespolu.",
    });
    expect(paths).toEqual(["interestArea", "rodoAck"]);
  });

  // Strona odwrotna reguly (ISK-373): na `/kontakt?szkolenie=<slug>` temat zgloszenia wynika
  // z `trainingId`, wiec brak `interestArea` NIE jest bledem — takze gdy inne pola sa puste.
  it("trainingId nadal zwalnia z interestArea, nawet przy bledach ksztaltu", () => {
    const paths = errorPaths({
      ...emptyForm,
      trainingId: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(paths).not.toContain("interestArea");
    expect(paths).toContain("rodoAck");
  });

  it("kind=osoba nigdy nie wymaga companyName, nawet przy bledach ksztaltu", () => {
    expect(errorPaths(emptyForm)).not.toContain("companyName");
  });

  // Sprawdzenie biegnie teraz takze na przerwanym parsowaniu, wiec musi zniesc wejscie,
  // ktore wcale nie jest obiektem — inaczej `value.trainingId` rzucilby TypeError.
  it.each([null, undefined, "hej", 42, [], true])(
    "nie wywraca sie na wejsciu, ktore nie jest obiektem (%p)",
    (input) => {
      expect(() => inquirySchema.safeParse(input)).not.toThrow();
      expect(inquirySchema.safeParse(input).success).toBe(false);
    },
  );
});
