"use client";

import { useState } from "react";

import { InquiryForm, type SelectedTraining } from "./inquiry-form";

type Props = {
  formToken: string;
  rodoClauseText: string;
  clauseApproved: boolean;
  training: SelectedTraining | null;
};

/**
 * ISK-373 / P13. Po udanej wysylce formularz znikal, ale naglowek nadal brzmial
 * „Zapytaj o szkolenie”, a lead zachecal „Wypelnij formularz jako osoba
 * indywidualna lub firma” — czyli strona namawiala do wypelnienia formularza,
 * ktorego na niej nie bylo. Oba teksty zyly w serwerowym `page.tsx`, wiec nie
 * mialy jak zareagowac na stan klienta; ta cienka warstwa trzyma je obok
 * formularza i przelacza na opis stanu PO wyslaniu.
 *
 * Komponent kliencki jest renderowany takze na serwerze, wiec `h1` nadal stoi
 * w HTML pierwszej odpowiedzi — SEO i indeksowanie nic nie traca.
 */
export function ContactSection({
  formToken,
  rodoClauseText,
  clauseApproved,
  training,
}: Props) {
  const [sent, setSent] = useState(false);

  return (
    <section aria-labelledby="kontakt-title" className="max-w-2xl">
      <h1
        id="kontakt-title"
        className="text-primary text-3xl font-bold tracking-tight sm:text-4xl"
      >
        {sent ? "Zgłoszenie przyjęte" : "Zapytaj o szkolenie"}
      </h1>
      <p className="text-secondary mt-4 text-lg leading-relaxed">
        {sent
          ? "Nic więcej nie musisz robić."
          : "Wypełnij formularz jako osoba indywidualna lub firma. Odpowiemy na podany adres e-mail."}
      </p>

      {/* Ostrzezenie o niezatwierdzonej klauzuli RODO (ISK-357 P1) musi stac
          miedzy leadem a formularzem, wiec mieszka tu razem z nimi. Po udanej
          wysylce nie ma go po co pokazywac — przy niezatwierdzonej klauzuli
          wysylka i tak jest niemozliwa, ale warunek zostaje jawny. */}
      {!sent && !clauseApproved ? (
        <p
          role="alert"
          className="border-warning-500 bg-warning-50 mt-6 rounded border-l-4 p-3 text-sm"
        >
          Treść klauzuli informacyjnej RODO nie została jeszcze zatwierdzona
          przez ISKT, dlatego formularz jest wyłączony — nie można wysłać
          zgłoszenia. W pilnej sprawie napisz na{" "}
          <a href="mailto:biuro@iskt.pl" className="text-primary underline">
            biuro@iskt.pl
          </a>
          .
        </p>
      ) : null}

      <InquiryForm
        formToken={formToken}
        rodoClauseText={rodoClauseText}
        clauseApproved={clauseApproved}
        training={training}
        onSuccess={() => setSent(true)}
      />
    </section>
  );
}
