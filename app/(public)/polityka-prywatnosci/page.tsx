import type { Metadata } from "next";

import { PageHeader, SubsectionTitle } from "@/components/ui";
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
//
// ISK-401 / M2 ruszylo tutaj WYLACZNIE uklad i kolory (powloka `ui-section`/`ui-container`,
// `PageHeader`, `SubsectionTitle`). Zadna z pozycji K1-K13 nie zostala przepisana ani
// skrocona — autorstwo tresci prawnej pozostaje po stronie ISKT.
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
    <main className="ui-section ui-section-head">
      <div className="ui-container">
        {/* `PageHeader` daje H1 w jednej, wspolnej skali (`.ui-page-title`) i lead
            wyciszony tokenem `--color-text-secondary` (`.ui-page-lead`).
            Do ISK-401 H1 nosil klase `text-primary`, czyli zielen MARKI
            (`--color-primary` = green-700) — nie kolor tekstu; a lead i wszystkie
            akapity mialy `text-secondary`, ktora nie kompiluje sie do niczego
            (tokenu `--color-secondary` nie ma), wiec „wyciszona” tresc renderowala
            sie niemal czarnym ink-900. */}
        <PageHeader
          eyebrow="Informacja RODO"
          lead="Informacja o przetwarzaniu danych osobowych osób korzystających z formularza kontaktowego serwisu szkoleń ISKT."
          title="Polityka prywatności"
        />

        {/* Kolumna tresci jest wezsza niz kontener — dluga linia tekstu prawnego
            jest nieczytelna (ok. 65–75 znakow to gorna granica). */}
        <article className="max-w-2xl">
          {!RODO_CLAUSE_APPROVED ? (
            // `role="note"` zostaje: to nota redakcyjna o stanie dokumentu, a nie
            // wynik operacji (`role="status"` z komponentu `Notice`) ani ostrzezenie
            // przerywajace czytnik (`role="alert"`). Klasy wizualne bierzemy z
            // `.ui-notice`, zeby nie powstal drugi styl komunikatu w projekcie.
            <p className="ui-notice ui-notice-info" role="note">
              <span>
                Uwaga: treść polityki prywatności jest obecnie szkieletem
                oczekującym na zatwierdzoną treść prawną od ISKT. Strona działa
                wyłącznie w środowisku lokalnym.
              </span>
            </p>
          ) : null}

          <div className="mt-8 flex flex-col gap-8">
            {SECTIONS.map((section) => (
              <section className="flex flex-col gap-2" key={section.heading}>
                {/* Jedna skala naglowka podsekcji dla calego serwisu (1,6 rem). */}
                <SubsectionTitle>{section.heading}</SubsectionTitle>
                <p className="text-text-secondary leading-relaxed">
                  {section.placeholder}
                </p>
              </section>
            ))}
          </div>

          <p className="text-text-secondary mt-10 text-sm">
            Wersja klauzuli informacyjnej: {clauseVersion}
          </p>
        </article>
      </div>
    </main>
  );
}
