import type { Metadata } from "next";

import { RODO_CLAUSE_APPROVED, getRodoClauseVersion } from "@/lib/rodo/clause";

export const metadata: Metadata = {
  title: "Polityka prywatności — Szkolenia ISKT",
  description:
    "Informacja o przetwarzaniu danych osobowych w serwisie szkoleń ISKT (klauzula informacyjna RODO).",
};

// =============================================================================
// PLACEHOLDER TRESCI PRAWNEJ — BRAMKA ISKT (ISK-357 T6, pozycje K1-K13 / I1 raportu E8).
// Zadanie techniczne to WYLACZNIE trwala, linkowalna trasa `/polityka-prywatnosci`, routing
// i odnosniki (stopka + checkbox formularza). TRESCI NIE GENERUJE AGENT — dostarcza ja ISKT.
// Ponizsze naglowki to szkielet klauzuli informacyjnej (art. 13/14 RODO) do wypelnienia.
// =============================================================================

type Section = { heading: string; placeholder: string };

const SECTIONS: Section[] = [
  {
    heading: "Administrator danych",
    placeholder:
      "[K1 — do wstawienia przez ISKT] Pełna nazwa, adres i dane kontaktowe administratora danych oraz, jeśli dotyczy, inspektora ochrony danych.",
  },
  {
    heading: "Cele i podstawy prawne przetwarzania",
    placeholder:
      "[K2–K4 — do wstawienia przez ISKT] Cele przetwarzania (obsługa zgłoszenia kontaktowego) oraz podstawy prawne (art. 6 ust. 1 RODO).",
  },
  {
    heading: "Zakres przetwarzanych danych",
    placeholder:
      "[K5 — do wstawienia przez ISKT] Kategorie danych podawanych w formularzu (imię i nazwisko, e-mail, telefon, treść wiadomości, ewentualnie nazwa firmy).",
  },
  {
    heading: "Odbiorcy danych i procesorzy",
    placeholder:
      "[K6–K7 — do wstawienia przez ISKT] Podmioty przetwarzające (hosting, dostawca poczty, baza danych) — po zatwierdzeniu listy procesorów i podpisaniu umów powierzenia.",
  },
  {
    heading: "Okres przechowywania",
    placeholder:
      "[K8 — do wstawienia przez ISKT] Okres przechowywania danych ze zgłoszeń oraz zasady ich usuwania (decyzja o retencji — bramka ISKT).",
  },
  {
    heading: "Prawa osoby, której dane dotyczą",
    placeholder:
      "[K9–K12 — do wstawienia przez ISKT] Prawo dostępu, sprostowania, usunięcia, ograniczenia, sprzeciwu, przenoszenia oraz wniesienia skargi do Prezesa UODO.",
  },
  {
    heading: "Dobrowolność podania danych",
    placeholder:
      "[K13 — do wstawienia przez ISKT] Informacja, czy podanie danych jest dobrowolne oraz jakie są konsekwencje ich niepodania.",
  },
];

export default function PolitykaPrywatnosciPage() {
  const clauseVersion = getRodoClauseVersion();

  return (
    <main className="max-w-container px-gutter py-section mx-auto min-h-screen">
      <article aria-labelledby="polityka-title" className="max-w-2xl">
        <h1
          id="polityka-title"
          className="text-primary text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Polityka prywatności
        </h1>
        <p className="text-secondary mt-4 text-lg leading-relaxed">
          Informacja o przetwarzaniu danych osobowych osób korzystających z formularza
          kontaktowego serwisu szkoleń ISKT.
        </p>

        {!RODO_CLAUSE_APPROVED ? (
          <p
            role="note"
            className="border-warning-500 bg-warning-50 mt-6 rounded border-l-4 p-3 text-sm"
          >
            Uwaga: treść polityki prywatności jest obecnie szkieletem oczekującym na zatwierdzoną
            treść prawną od ISKT. Strona działa wyłącznie w środowisku lokalnym.
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h2 className="text-primary text-xl font-semibold">{section.heading}</h2>
              <p className="text-secondary leading-relaxed">{section.placeholder}</p>
            </section>
          ))}
        </div>

        <p className="text-secondary mt-10 text-sm">Wersja klauzuli informacyjnej: {clauseVersion}</p>
      </article>
    </main>
  );
}
