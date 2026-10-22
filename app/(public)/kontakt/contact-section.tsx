"use client";

import { useState } from "react";

import { Card, Eyebrow, IconChip } from "@/components/ui";
import { AUDIENCE_DEFAULT, type Audience } from "@/lib/audience";

import { InquiryForm, type SelectedTraining } from "./inquiry-form";

type Props = {
  formToken: string;
  rodoClauseText: string;
  clauseApproved: boolean;
  training: SelectedTraining | null;
  /** Rodzaj zgloszenia z `?rodzaj=` — strona glowna linkuje tu z wybranym audytorium. */
  kind?: Audience;
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
 *
 * ISK-401 / M2: uklad to pasmo kontaktowe wzorca — kolumna tekstu z danymi
 * kontaktowymi po lewej, biala karta z formularzem po prawej. Klasy
 * `home-contact*` sa WSPOLNE ze strona glowna (`app/(public)/home-sections.tsx`):
 * ten sam uklad w dwoch miejscach ma miec jedna regule, a nie dwie podobne.
 */
export function ContactSection({
  formToken,
  rodoClauseText,
  clauseApproved,
  training,
  kind = AUDIENCE_DEFAULT,
}: Props) {
  const [sent, setSent] = useState(false);
  // Rodzaj WYBRANY w formularzu — `kind` z adresu jest tylko punktem startowym.
  // Stan sluzy wylacznie opisowi strony; wartoscia wyslana w zgloszeniu zarzadza
  // react-hook-form w `InquiryForm` (patrz komentarz przy `Props.kind` tam).
  const [audience, setAudience] = useState<Audience>(kind);

  return (
    <section
      aria-labelledby="kontakt-title"
      className="home-contact ui-container"
    >
      <div className="home-contact-text">
        <Eyebrow>Zgłoszenie</Eyebrow>
        {/* Tytul jest sprawdzany co do znaku w `ux-powazne.spec.ts` (P13)
            i `public-pages.spec.ts`, w obu stanach. Do ISK-401 nosil klase
            `text-primary`, ktora NIE jest kolorem tekstu — `--color-primary`
            to zielen marki (green-700), wiec naglowek strony kontaktu byl
            zielony, bez zadnej decyzji projektowej za tym. */}
        <h1 className="ui-section-title" id="kontakt-title">
          {sent ? "Zgłoszenie przyjęte" : "Zapytaj o szkolenie"}
        </h1>
        <p className="ui-section-lead">
          {sent
            ? "Nic więcej nie musisz robić."
            : audience === "firma"
              ? "Wypełnij formularz jako firma — podaj nazwę i opisz potrzeby zespołu. Odpowiemy na podany adres e-mail."
              : "Wypełnij formularz jako osoba indywidualna. Odpowiemy na podany adres e-mail."}
        </p>

        {/* Dane kontaktowe obok formularza — wzorzec stawia je w tym samym pasmie,
            a osoba, ktora nie chce wypelniac formularza, dostaje drugie wyjscie.
            Odnosnik e-mail jest w `li`, czyli w biegu tresci: WCAG 2.5.5 wyjmuje
            „inline” z wymogu 44 px, a podnoszenie go rozerwaloby rzad z chipem. */}
        <ul className="home-contact-rows">
          <li className="home-contact-row">
            <IconChip icon="mail" size="md" tone="soft" />
            <a className="home-contact-link" href="mailto:biuro@iskt.pl">
              biuro@iskt.pl
            </a>
          </li>
          <li className="home-contact-row">
            <IconChip icon="map-pin" size="md" tone="soft" />
            <span>[DEMO] Żory, woj. śląskie</span>
          </li>
          <li className="home-contact-row">
            <IconChip icon="clock" size="md" tone="soft" />
            {/* Wzorzec obiecuje tu kontakt „w ciagu 24 godzin” — ISK-399 / D1
                zabrania SLA, ktorego nikt nie potwierdzil. */}
            <span>Odpowiadamy na podany adres e-mail</span>
          </li>
        </ul>
      </div>

      <Card className="home-contact-card" padding="roomy">
        {/* Ostrzezenie o niezatwierdzonej klauzuli RODO (ISK-357 P1) stoi miedzy
            leadem a formularzem: w kolejnosci czytania kolumna tekstu jest przed
            karta, wiec pierwsze dziecko karty jest wlasnie tym miejscem.

            NIE uzywamy tu komponentu `Notice`, mimo identycznego wygladu: `Notice`
            niesie `role="status"`, a ten komunikat ma `role="alert"` i musi go
            zachowac. Roznica jest celowa po obu stronach — `status` jest wlasciwy
            dla wyniku operacji (nie przerywa czytnika ekranu), a tutaj chodzi
            o stan, ktory UNIEMOZLIWIA wykonanie glownego zadania strony i stoi
            w drzewie od pierwszego renderu. Ton bledu, nie informacji, z tego
            samego powodu: formularz jest wylaczony, a nie tylko inny.
            Jedno dziecko `<span>`, bo `.ui-notice` jest kontenerem `flex`. */}
        {!sent && !clauseApproved ? (
          <p className="ui-notice ui-notice-error" role="alert">
            <span>
              Treść klauzuli informacyjnej RODO nie została jeszcze zatwierdzona
              przez ISKT, dlatego formularz jest wyłączony — nie można wysłać
              zgłoszenia. W pilnej sprawie napisz na{" "}
              <a className="underline" href="mailto:biuro@iskt.pl">
                biuro@iskt.pl
              </a>
              .
            </span>
          </p>
        ) : null}

        <InquiryForm
          clauseApproved={clauseApproved}
          formToken={formToken}
          kind={kind}
          onKindChange={setAudience}
          onSuccess={() => setSent(true)}
          rodoClauseText={rodoClauseText}
          training={training}
        />
      </Card>
    </section>
  );
}
