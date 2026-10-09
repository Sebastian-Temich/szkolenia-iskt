import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InquiryForm } from "@/app/kontakt/inquiry-form";

// Techniczna bramka RODO w UI (ISK-357 P1). Gdy klauzula nie jest zatwierdzona, przycisk
// "Wyslij zgloszenie" MUSI byc nieaktywny (`disabled`). Nieaktywny submit nie wyzwala zdarzenia
// submit, wiec klikniecie nie moze wywolac `onValid` ani POST /api/inquiries — to jest wlasnie
// dowod, ze UI blokuje wyslanie, a nie tylko ostrzega. Serwer jest druga, niezalezna warstwa
// (processInquiry -> 503 clause_not_approved, pokryte w inquiry-handler.test.ts).

// Renderujemy komponent przez react-dom/server (bez jsdom) i wycinamy znacznik <button ...>.
function renderSubmitButtonTag(clauseApproved: boolean): string {
  const html = renderToStaticMarkup(
    createElement(InquiryForm, {
      formToken: "test-token",
      rodoClauseText: "Placeholder klauzuli RODO.",
      clauseApproved,
    }),
  );
  const match = html.match(/<button[^>]*type="submit"[^>]*>/);
  if (!match) {
    throw new Error(`Nie znaleziono przycisku submit w wyrenderowanym HTML:\n${html}`);
  }
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
