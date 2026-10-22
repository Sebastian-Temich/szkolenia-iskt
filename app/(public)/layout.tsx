import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Powloka widokow publicznych: pasek srodowiska demo, naglowek marketingowy,
 * tresc, stopka.
 *
 * Mieszkala wczesniej w `app/layout.tsx`, wiec panel administratora
 * dziedziczyl ja razem z `<html>` — kazdy jego widok mial dwa landmarki
 * `banner` i dwie nawigacje (defekt POW-1, `docs/qa/raport-e6.md`). Grupa
 * tras `(public)` nie zmienia adresow URL, a odcina panel od tej powloki.
 *
 * DLACZEGO PASEK DEMO STOI TUTAJ, A NIE W `app/layout.tsx`
 * Panel ma swoja powloke i swojego uzytkownika — administrator wie, na czym
 * pracuje. Pasek jest komunikatem dla ODWIEDZAJACEGO, wiec nalezy do tras
 * publicznych. Stoi NAD naglowkiem, bo naglowek jest `position: sticky;
 * top: 0`: pasek przewija sie razem z trescia i nie zabiera miejsca na
 * telefonie po pierwszym przewinieciu, a naglowek dalej przykleja sie do
 * gornej krawedzi.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <DemoBanner />
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}

/**
 * JEDEN sygnal o danych demonstracyjnych (ISK-409 / UX-B3).
 *
 * PROBLEM, KTORY TO ZASTEPUJE
 * Zasiew wszywal `[DEMO]` w NAZWY WLASNE — `categories.name`,
 * `trainings.title`, `trainers.full_name`. Dawalo to 29 widocznych wystapien
 * na `/`, 19 na `/szkolenia` i 11 na `/trenerzy`: pigulki filtrow brzmialy
 * "Wszystkie / [DEMO] Sztuczna inteligencja / …", cala kolumna "Obszary"
 * w stopce byla oznaczona, a trenerzy nazywali sie "[DEMO] Jan Przykladowy".
 * Przy takiej gestosci znacznik przestaje cokolwiek wyrozniac, a w nazwie
 * wlasnej i tak nie chronil niczego: nazwa kategorii nie jest twierdzeniem
 * o faktach, wiec nie ma w niej czego kwestionowac. Znacznik ma stac przy
 * TWIERDZENIACH (tresc marketingowa, adres, dofinansowanie) — i tam zostaje,
 * razem ze zdaniem w stopce, ktore go objasnia.
 *
 * DLACZEGO `role="note"`, A NIE `role="alert"` ANI `aria-live`
 * To staly fakt o calym srodowisku, a nie zdarzenie i nie zmiana stanu.
 * `alert`/`aria-live` kazalyby czytnikowi ekranu przerwac lekture i oglosic
 * pasek przy kazdym wejsciu na strone, co jest halasem, a nie informacja.
 * `note` zostawia go w normalnej kolejnosci czytania na poczatku dokumentu.
 *
 * Pasek NIE jest interaktywny, wiec nie ma celu dotykowego do mierzenia,
 * i nie zawiera naglowka, wiec nie rusza konspektu ani licznika `h1`.
 */
function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <p className="demo-banner-text ui-container">
        <strong>Środowisko demonstracyjne.</strong> Katalog szkoleń, obszary i
        trenerzy to dane przykładowe — nazwy, opisy, ceny i osoby są fikcyjne.
      </p>
    </div>
  );
}
