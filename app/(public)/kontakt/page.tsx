import type { Metadata } from "next";

import { toAudience } from "@/lib/audience";
import { getTraining } from "@/lib/public-catalog";
import { RODO_CLAUSE_TEXT, isRodoClauseApproved } from "@/lib/rodo/clause";
import { issueFormToken } from "@/lib/security/form-token";

import { ContactSection } from "./contact-section";

export const metadata: Metadata = {
  title: "Kontakt — Szkolenia ISKT",
  description: "Formularz zgłoszeniowy — osoba indywidualna lub firma.",
};

// Token czasowy wydajemy przy renderze strony; dlatego strona jest dynamiczna.
export const dynamic = "force-dynamic";

/**
 * `?szkolenie=<slug>` rozwiazujemy tutaj na serwerze (ISK-364 / P4). Wczesniej
 * strona ignorowala `searchParams`, wiec `inquiries.training_id` bylo ZAWSZE
 * NULL — administrator dostawal zgloszenie bez wskazania szkolenia, mimo ze
 * model danych je przewiduje.
 *
 * Slug zamieniamy na identyfikator po stronie serwera, a nie przyjmujemy
 * `trainingId` z adresu: przegladarka nie moze podstawic dowolnego UUID, a
 * `getTraining` zwraca wylacznie pozycje opublikowane. Nieznany lub wycofany
 * slug daje `null` i formularz zachowuje sie jak wejscie bez parametru.
 *
 * `?rodzaj=osoba|firma` (ISK-401 / M2) jest drugim parametrem wejsciowym: strona
 * glowna linkuje tu z wybranym audytorium, zeby osoba nie wybierala dwa razy
 * tego samego. `toAudience` sprowadza KAZDA wartosc do dozwolonego rodzaju
 * (`lib/audience.ts`), wiec `?rodzaj=cokolwiek` daje stan domyslny, a nie wyjatek
 * — parametr adresu jest wejsciem spoza typu i nie moze wywrocic renderu.
 */
export default async function KontaktPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tokenSecret = process.env.FORM_TOKEN_SECRET;
  const formToken = tokenSecret ? issueFormToken(tokenSecret) : "";
  const clauseApproved = isRodoClauseApproved();

  const { szkolenie, rodzaj } = await searchParams;
  const slug = typeof szkolenie === "string" ? szkolenie.trim() : "";
  const training = slug ? await getTraining(slug) : null;
  const kind = toAudience(typeof rodzaj === "string" ? rodzaj.trim() : rodzaj);

  return (
    // Ten sam rytm i kontener, co katalog i trenerzy (`ui-section ui-section-head`
    // + `ui-container`). Do ISK-401 strona uzywala wlasnej powloki
    // `max-w-container px-gutter py-section`, czyli siodmego ukladu na szesc widokow.
    <main className="ui-section ui-section-head">
      {/* Naglowek, lead i ostrzezenie o klauzuli przeniesione do `ContactSection`
          (ISK-373 / P13): po udanej wysylce musza opisywac stan po wyslaniu, a
          serwerowy komponent nie wie, ze formularz zostal juz wyslany. */}
      <ContactSection
        clauseApproved={clauseApproved}
        formToken={formToken}
        kind={kind}
        rodoClauseText={RODO_CLAUSE_TEXT}
        training={
          training
            ? { id: training.id, title: training.title, slug: training.slug }
            : null
        }
      />
    </main>
  );
}
