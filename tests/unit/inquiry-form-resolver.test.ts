import { zodResolver } from "@hookform/resolvers/zod";
import { createFormControl } from "react-hook-form";
import { describe, expect, it } from "vitest";

import {
  inquiryFormDefaults,
  type SelectedTraining,
} from "@/app/(public)/kontakt/inquiry-form";
import { inquirySchema } from "@/lib/validation/inquiry";

// ISK-383: ta regula zyje NA GRANICY miedzy formularzem a schematem, nie w samym schemacie.
// `inquirySchema` wymaga `interestArea` tylko wtedy, gdy zgloszenie nie nosi `trainingId`
// (`superRefine`). Dopoki `trainingId` nie byl czescia wartosci formularza, walidacja klienta
// widziala ZAWSZE `!trainingId` — a wiec wymagala `interestArea` nawet na
// `/kontakt?szkolenie=<slug>`, gdzie etykieta nie ma gwiazdki i ma `aria-required="false"`.
// Serwer tymczasem przyjmowal to samo zgloszenie, bo w ciele POST `trainingId` byl obecny.
//
// Dlatego test NIE wola `inquirySchema.safeParse` na recznie zlozonym obiekcie: taki obiekt
// zawsze przeszedlby, bo autor testu dopisalby `trainingId`. Defekt polegal wlasnie na tym, ze
// te dwie granice widza INNY obiekt. Mierzymy wiec dokladnie to, co robi komponent: te same
// `defaultValues` (`inquiryFormDefaults`) przepuszczone przez prawdziwy `zodResolver` i prawdziwy
// potok `handleSubmit` z react-hook-form. `createFormControl` daje ten potok bez jsdom.

const TRAINING: SelectedTraining = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "[TEST] Szkolenie wskazane linkiem",
  slug: "test-szkolenie-wskazane-linkiem",
};

/** Poprawnie wypelnione pola widoczne w formularzu — poza `interestArea`, ktore rozstrzyga test. */
const FILLED_BY_USER = {
  kind: "osoba",
  fullName: "Jan Kowalski",
  email: "jan@example.com",
  phone: "600100200",
  message: "Proszę o ofertę szkolenia dla zespołu.",
  rodoAck: true,
} as const;

type SubmitOutcome = {
  /** Klucze bledow z `handleSubmit`; pusta tablica = wysylka przeszla walidacje. */
  errors: string[];
  /** Obiekt, ktory `onValid` dostaje i z ktorego buduje cialo POST (`undefined`, gdy odrzucono). */
  validated: Record<string, unknown> | undefined;
};

/**
 * Przepuszcza formularz przez PRAWDZIWY potok react-hook-form: `defaultValues` komponentu
 * nadpisane tym, co wpisala (albo wyczyscila) osoba, `zodResolver(inquirySchema)` jako resolver
 * i `handleSubmit` jako wyzwalacz. Zwraca to, co realnie widzi `onValid`.
 */
async function submitForm(
  training: SelectedTraining | null,
  userInput: Record<string, unknown>,
): Promise<SubmitOutcome> {
  const { formControl } = createFormControl({
    resolver: zodResolver(inquirySchema) as never,
    defaultValues: { ...inquiryFormDefaults(training), ...userInput } as never,
  });

  let validated: Record<string, unknown> | undefined;
  let errors: string[] = [];
  await formControl.handleSubmit(
    (data) => {
      validated = data as Record<string, unknown>;
    },
    (formErrors) => {
      errors = Object.keys(formErrors);
    },
  )();

  return { errors, validated };
}

describe("InquiryForm — `interestArea` na granicy zodResolver/formularza (ISK-383)", () => {
  it("ze wskazanym szkoleniem wyczyszczone `interestArea` NIE blokuje wysylki", async () => {
    // Krok z karty: wejscie na /kontakt?szkolenie=<slug>, etykieta bez gwiazdki
    // (`aria-required="false"`), osoba czysci pole wypelnione domyslnie tytulem.
    const { errors, validated } = await submitForm(TRAINING, {
      ...FILLED_BY_USER,
      interestArea: "",
    });

    expect(errors).toEqual([]);
    expect(validated).toBeDefined();
    // Klient walidowal TEN SAM ksztalt, ktory poleci w ciele POST — `trainingId` jest
    // w zwalidowanym obiekcie, a nie dokladany obok niego z domkniecia komponentu.
    expect(validated?.trainingId).toBe(TRAINING.id);
  });

  it("bez wskazanego szkolenia `interestArea` nadal jest wymagane (drugi kierunek reguly)", async () => {
    const { errors, validated } = await submitForm(null, {
      ...FILLED_BY_USER,
      interestArea: "",
    });

    expect(errors).toEqual(["interestArea"]);
    expect(validated).toBeUndefined();
  });

  it("bez szkolenia, ale z wpisanym obszarem, wysylka przechodzi bez `trainingId`", async () => {
    // Kontrapunkt: regula ma dwa wyjscia, nie jedno. Pusty `trainingId` nie moze
    // przeciekac do ciala POST jako pusty string — `z.uuid()` by go odrzucil.
    const { errors, validated } = await submitForm(null, {
      ...FILLED_BY_USER,
      interestArea: "Bezpieczeństwo pracy na wysokości",
    });

    expect(errors).toEqual([]);
    expect(validated?.interestArea).toBe("Bezpieczeństwo pracy na wysokości");
    expect(validated?.trainingId).toBeUndefined();
  });
});

describe("InquiryForm — `defaultValues` niosa `trainingId` (ISK-383)", () => {
  it("ze wskazanym szkoleniem `trainingId` jest wartoscia formularza", async () => {
    // Regresja wrocilaby przez usuniecie tego klucza z `defaultValues` i dokladanie
    // `training?.id` dopiero w `onValid` — czyli dwa zrodla prawdy.
    expect(inquiryFormDefaults(TRAINING).trainingId).toBe(TRAINING.id);
    // `interestArea` zostaje czytelnym tematem zgloszenia, nie znika z formularza.
    expect(inquiryFormDefaults(TRAINING).interestArea).toBe(TRAINING.title);
  });

  it("bez szkolenia `trainingId` jest `undefined`, nie pustym stringiem", () => {
    // `trainingId: ""` przeszloby przez `optional()` do `z.uuid()` i wywrocilo
    // kazda wysylke z /kontakt bez parametru.
    expect(inquiryFormDefaults(null).trainingId).toBeUndefined();
    expect(inquiryFormDefaults(null).interestArea).toBe("");
  });
});
