import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InquiryForm,
  type SelectedTraining,
} from "@/app/(public)/kontakt/inquiry-form";

// Techniczna bramka RODO w UI (ISK-357 P1). Gdy klauzula nie jest zatwierdzona, przycisk
// "Wyslij zgloszenie" MUSI byc nieaktywny (`disabled`). Nieaktywny submit nie wyzwala zdarzenia
// submit, wiec klikniecie nie moze wywolac `onValid` ani POST /api/inquiries — to jest wlasnie
// dowod, ze UI blokuje wyslanie, a nie tylko ostrzega. Serwer jest druga, niezalezna warstwa
// (processInquiry -> 503 clause_not_approved, pokryte w inquiry-handler.test.ts).

// Renderujemy komponent przez react-dom/server (bez jsdom) i wycinamy znacznik <button ...>.
function renderForm(
  clauseApproved: boolean,
  training: SelectedTraining | null = null,
): string {
  return renderToStaticMarkup(
    createElement(InquiryForm, {
      formToken: "test-token",
      rodoClauseText: "Placeholder klauzuli RODO.",
      clauseApproved,
      training,
    }),
  );
}

function renderSubmitButtonTag(clauseApproved: boolean): string {
  const html = renderForm(clauseApproved);
  const match = html.match(/<button[^>]*type="submit"[^>]*>/);
  if (!match) {
    throw new Error(`Nie znaleziono przycisku submit w wyrenderowanym HTML:\n${html}`);
  }
  return match[0];
}

/** Znacznik otwierajacy pola o danym `id` — do asercji na lancuchu klas. */
function fieldTag(html: string, id: string): string {
  const match = html.match(
    new RegExp(`<(?:input|textarea)[^>]*id="${id}"[^>]*>`),
  );
  if (!match) throw new Error(`Nie znaleziono pola ${id} w HTML:\n${html}`);
  return match[0];
}

describe("InquiryForm — techniczna bramka RODO w UI (ISK-357 P1)", () => {
  // Uwaga: w className jest wariant Tailwind `disabled:opacity-60`, wiec sprawdzamy atrybut
  // boolowski w jego dokladnej postaci `disabled=""` (nie samo slowo "disabled").
  it("przycisk wysylki jest nieaktywny, gdy klauzula nie jest zatwierdzona", () => {
    const button = renderSubmitButtonTag(false);
    expect(button).toContain('disabled=""');
  });

  it("przycisk wysylki jest aktywny, gdy klauzula jest zatwierdzona (kontrapunkt)", () => {
    const button = renderSubmitButtonTag(true);
    // W stanie idle, bez trwajacego submitu, przycisk nie moze byc zablokowany.
    expect(button).not.toContain('disabled=""');
  });
});

// --- ISK-373: P2, P5 (przycisk), P12 -----------------------------------------
//
// Te asercje celuja w lancuch klas, a nie w zmierzony piksel — pomiar
// `getComputedStyle`/`getBoundingClientRect` siedzi w `tests/e2e/ux-powazne.spec.ts`
// i to on jest dowodem dla bramki. Tutaj pilnujemy taniej i szybko tego, co
// najlatwiej zgubic przy nastepnej edycji JSX: jawnego koloru krawedzi
// (bez niego Tailwind v4 wraca do `currentColor`), wariantu bledu i wysokosci
// przycisku.

describe("InquiryForm — krawedzie pol uzywaja tokenu (ISK-373 / P2)", () => {
  const html = renderForm(true);

  it.each(["fullName", "email", "phone", "interestArea", "message"])(
    "pole %s ma jawny kolor krawedzi",
    (id) => {
      const tag = fieldTag(html, id);
      // Samo `border` ustawia TYLKO grubosc; kolor bez tej klasy dziedziczy
      // `currentColor`, czyli prawie czarne `--color-text-primary`.
      expect(tag).toContain("border-border-default");
    },
  );

  it("zadne pole nie zostaje przy golym `border` bez koloru", () => {
    // Regresja wrocilaby wlasnie tak: nowe pole dopisane z `className="rounded border p-2"`.
    const bare = html.match(/class="[^"]*\bborder\b(?![-\w])[^"]*"/g) ?? [];
    for (const cls of bare) {
      // `border-l-4` w alercie o wygasnieciu ma wlasny kolor (`border-warning-500`).
      expect(cls).toMatch(/border-(border-default|warning-500)/);
    }
  });
});

describe("InquiryForm — oznaczenie bledu i wymagalnosci (ISK-373 / P12)", () => {
  const html = renderForm(true);

  it.each(["fullName", "email", "phone", "interestArea", "message"])(
    "pole %s ma oznaczenie bledu niezalezne od fokusu",
    (id) => {
      const tag = fieldTag(html, id);
      // Wariant kompiluje sie do `.klasa[aria-invalid="true"]`, wiec dziala bez
      // fokusu i wygrywa specyficznoscia, nie kolejnoscia w arkuszu.
      expect(tag).toContain("aria-[invalid=true]:border-error-500");
      // Kolor nie jest jedynym nosnikiem informacji (WCAG 1.4.1).
      expect(tag).toContain("aria-[invalid=true]:border-2");
      expect(tag).toContain("aria-[invalid=true]:bg-error-50");
    },
  );

  it.each(["fullName", "email", "phone", "message"])(
    "pole %s jest oznaczone jako wymagane",
    (id) => {
      expect(fieldTag(html, id)).toContain('aria-required="true"');
    },
  );

  it("formularz objasnia, co znaczy gwiazdka", () => {
    expect(html).toContain("Pola oznaczone gwiazdką");
  });

  it("gwiazdka jest `aria-hidden` — informacje dla czytnika niesie aria-required", () => {
    // Bez tego czytnik ekranu oglasza wymagalnosc dwa razy: raz z etykiety,
    // raz z `aria-required`.
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*">\*<\/span>/);
  });

  it("„Interesujące szkolenie” nie jest wymagane, gdy szkolenie jest wskazane", () => {
    // `inquirySchema.superRefine` wymaga tego pola tylko wtedy, gdy zgloszenie
    // nie nosi `trainingId` — oznaczenie musi isc za regula, inaczej klamie.
    const withTraining = renderForm(true, {
      id: "11111111-1111-4111-8111-111111111111",
      title: "[TEST] Szkolenie wskazane",
      slug: "test-szkolenie-wskazane",
    });
    expect(fieldTag(withTraining, "interestArea")).toContain(
      'aria-required="false"',
    );
    expect(fieldTag(html, "interestArea")).toContain('aria-required="true"');
  });
});

describe("InquiryForm — cel dotykowy przycisku wysylki (ISK-373 / P5)", () => {
  it("przycisk ma min-h-11 (2.75rem = 44 px)", () => {
    // Bramka zmierzyla 173,1 x 40 px — `py-2` nie dawalo 44 px.
    const button = renderSubmitButtonTag(true);
    expect(button).toContain("min-h-11");
    expect(button).not.toMatch(/\bpy-2\b/);
  });

  it("wiersze kontrolek radio i checkbox tez maja 44 px", () => {
    const html = renderForm(true);
    const labels = html.match(/<label class="[^"]*"/g) ?? [];
    const controlRows = labels.filter((label) => label.includes("min-h-11"));
    // Dwa radio („Osoba indywidualna”, „Firma”) + checkbox RODO.
    expect(controlRows).toHaveLength(3);
  });
});

describe("InquiryForm — afordancja wysylki w stanie idle (ISK-373 / P13)", () => {
  it("w stanie idle nie ma ani `aria-busy=true`, ani wskaznika", () => {
    // Kontrapunkt do testow e2e: afordancja musi byc stanem, nie dekoracja
    // widoczna zawsze. SSR renderuje wylacznie stan `idle`.
    const html = renderForm(true);
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("Wysyłanie…");
    expect(html).toContain("Wyślij zgłoszenie");
  });
});
