import type { Metadata } from "next";

import {
  RODO_CLAUSE_APPROVED,
  RODO_CLAUSE_TEXT,
  getRodoClauseVersion,
} from "@/lib/rodo/clause";
import { issueFormToken } from "@/lib/security/form-token";

import { InquiryForm } from "./inquiry-form";

export const metadata: Metadata = {
  title: "Kontakt — Szkolenia ISKT",
  description: "Formularz zgłoszeniowy — osoba indywidualna lub firma.",
};

// Token czasowy wydajemy przy renderze strony; dlatego strona jest dynamiczna.
export const dynamic = "force-dynamic";

export default function KontaktPage() {
  const tokenSecret = process.env.FORM_TOKEN_SECRET;
  const formToken = tokenSecret ? issueFormToken(tokenSecret) : "";
  const rodoClauseVersion = getRodoClauseVersion();

  return (
    <main className="max-w-container px-container py-section mx-auto min-h-screen">
      <section aria-labelledby="kontakt-title" className="max-w-2xl">
        <h1 id="kontakt-title" className="text-primary text-3xl font-bold tracking-tight sm:text-4xl">
          Zapytaj o szkolenie
        </h1>
        <p className="text-secondary mt-4 text-lg leading-relaxed">
          Wypełnij formularz jako osoba indywidualna lub firma. Odpowiemy na podany adres e-mail.
        </p>

        {!RODO_CLAUSE_APPROVED ? (
          <p
            role="note"
            className="border-warning-500 bg-warning-50 mt-6 rounded border-l-4 p-3 text-sm"
          >
            Uwaga: treść klauzuli RODO jest obecnie placeholderem oczekującym na zatwierdzenie
            przez ISKT. Formularz działa wyłącznie w środowisku lokalnym.
          </p>
        ) : null}

        <InquiryForm
          formToken={formToken}
          rodoClauseVersion={rodoClauseVersion}
          rodoClauseText={RODO_CLAUSE_TEXT}
        />
      </section>
    </main>
  );
}
