import { z } from "zod";

// Jeden schemat Zod wspoldzielony przez klienta (React Hook Form) i serwer (Route Handler).
// Reguly pokrywaja sie z ograniczeniami CHECK w bazie (ADR-0004 §2, trzecia warstwa obrony).
// Serwer nigdy nie ufa klientowi — ten sam schemat jest zrodlem prawdy po obu stronach.

export const INQUIRY_KINDS = ["osoba", "firma"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];

export const INQUIRY_LIMITS = {
  fullName: { min: 2, max: 120 },
  email: { max: 254 },
  phone: { min: 6, max: 20 },
  companyName: { max: 160 },
  interestArea: { max: 160 },
  message: { min: 10, max: 2000 },
} as const;

const PHONE_PATTERN = /^[0-9+\-()\s]+$/;

// Wykrywa znaki sterujace poza dozwolonymi bialymi (tab, nowa linia, powrot karetki).
// Skan po punktach kodowych — bez znakow sterujacych w zrodle i bez no-control-regex.
function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

export const inquirySchema = z
  .object({
    kind: z.enum(INQUIRY_KINDS, { message: "Wybierz rodzaj zgłoszenia." }),
    fullName: z
      .string()
      .trim()
      .min(INQUIRY_LIMITS.fullName.min, { message: "Podaj imię i nazwisko (min. 2 znaki)." })
      .max(INQUIRY_LIMITS.fullName.max, { message: "Imię i nazwisko jest za długie." }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(INQUIRY_LIMITS.email.max, { message: "Adres e-mail jest za długi." })
      .pipe(z.email({ message: "Podaj poprawny adres e-mail." })),
    phone: z
      .string()
      .trim()
      .min(INQUIRY_LIMITS.phone.min, { message: "Podaj numer telefonu." })
      .max(INQUIRY_LIMITS.phone.max, { message: "Numer telefonu jest za długi." })
      .regex(PHONE_PATTERN, { message: "Numer telefonu zawiera niedozwolone znaki." }),
    companyName: optionalText(INQUIRY_LIMITS.companyName.max),
    trainingId: z.uuid({ message: "Niepoprawny identyfikator szkolenia." }).optional(),
    interestArea: optionalText(INQUIRY_LIMITS.interestArea.max),
    message: z
      .string()
      .trim()
      .min(INQUIRY_LIMITS.message.min, { message: "Wiadomość jest za krótka (min. 10 znaków)." })
      .max(INQUIRY_LIMITS.message.max, { message: "Wiadomość jest za długa (maks. 2000 znaków)." })
      .refine((value) => !hasControlChars(value), {
        message: "Wiadomość zawiera niedozwolone znaki sterujące.",
      }),
    rodoAck: z.literal(true, {
      message: "Potwierdzenie zapoznania się z informacją RODO jest wymagane.",
    }),
    // UWAGA: `rodoClauseVersion` celowo NIE jest polem wejsciowym (ISK-357 T3). Wersje klauzuli
    // ustala serwer z `getRodoClauseVersion()` — wartosc z ciala zadania bylaby dowolnie
    // podmienialna i podkopywalaby rozliczalnosc (art. 5 ust. 2 RODO).
  })
  .superRefine((value, ctx) => {
    if (value.kind === "firma" && !value.companyName) {
      ctx.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Nazwa firmy jest wymagana dla zgłoszenia firmowego.",
      });
    }
    if (!value.trainingId && !value.interestArea) {
      ctx.addIssue({
        code: "custom",
        path: ["interestArea"],
        message: "Wskaż interesujące szkolenie lub obszar.",
      });
    }
  });

export type InquiryInput = z.input<typeof inquirySchema>;
export type InquiryData = z.output<typeof inquirySchema>;
