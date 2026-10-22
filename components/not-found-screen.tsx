import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui";

type Props = {
  /** H1 ekranu. MUSI zawierac „Nie znaleźliśmy” — patrz komentarz nizej. */
  title: string;
  /** Zdanie wyjasniajace przyczyne. */
  children: ReactNode;
  /** Wyjscia z zaulka: jeden albo dwa `ButtonLink`. */
  actions: ReactNode;
};

/**
 * Wspolny ekran 404 — JEDNO ZRODLO DLA OBU TRAS.
 *
 * ISK-412 / UX-Z1. Produkt mial dwa ekrany 404, ktore zachowywaly sie inaczej:
 * globalny `app/not-found.tsx` renderowal sie bez naglowka i stopki, a 404
 * szczegolu szkolenia z pelna powloka. Oba dawaly przy tym `h1` o rozmiarze
 * 21,6 px (`.empty-state-title`), gdy standardem strony jest 48 px
 * (`.ui-page-title`) — czyli najwazniejszy naglowek na ekranie bledu byl
 * mniejszy od tytulu zwyklej karty.
 *
 * Teraz oba ekrany skladaja sie z tego komponentu, wiec nie moga sie
 * rozjechac: ta sama powloka (`ui-section ui-section-head` + `ui-container`),
 * ten sam `PageHeader` i ta sama skala H1. Rozni je wylacznie tresc —
 * przyczyna bledu i liczba wyjsc.
 *
 * H1 ZAWIERA „Nie znaleźliśmy” W OBU PRZYPADKACH
 * `public-pages.spec.ts` sprawdza ten tekst RAZEM ze statusem 404, czyli
 * dowodzi, ze nieopublikowane szkolenie nie tylko wyglada na nieobecne, ale
 * faktycznie oddaje 404 (ochrona szkicow). Zmiana tego napisu rozbroi bramke.
 */
export function NotFoundScreen({ title, children, actions }: Props) {
  return (
    <main className="ui-section ui-section-head">
      <div className="ui-container">
        <PageHeader eyebrow="404" lead={children} title={title} />
        <div className="flex flex-wrap gap-3">{actions}</div>
      </div>
    </main>
  );
}
