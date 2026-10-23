import Link from "next/link";

import { Icon } from "@/components/ui";

export const metadata = {
  title: "Nie znaleźliśmy tej pozycji — Panel ISKT",
};

/**
 * 404 WEWNATRZ PANELU (ISK-426 / D-2 z M4b-R).
 *
 * CO NAPRAWIA
 * Cztery trasy szczegolu panelu wolaja `notFound()` dla nieistniejacego
 * identyfikatora (`szkolenia/[id]`, `szkolenia/kategorie/[id]`,
 * `trenerzy/[id]`, `zgloszenia/[id]`). Bez tego pliku granica `not-found`
 * wypadala az na `app/not-found.tsx`, czyli administrator z literowka w ID
 * dostawal PUBLICZNY ekran 404 z marketingowym naglowkiem i stopka, a oba
 * wyjscia prowadzily go POZA panel („Strona glowna", „Katalog szkolen").
 *
 * DLACZEGO WLASNIE POD `(admin)`, A NIE POD `app/panel/`
 * Granica postawiona na `app/panel/not-found.tsx` lapalaby takze adresy
 * NIEDOPASOWANE (`/panel/cokolwiek`), ktore nie przechodza przez
 * `requireAdmin()` w `(admin)/layout.tsx` — anonimowy odwiedzajacy zobaczylby
 * wtedy powloke panelu. Pod `(admin)` granica renderuje sie w layoucie
 * panelu, czyli dopiero PO kontroli dostepu, a nieznane adresy `/panel/...`
 * nadal dostaja publiczny ekran 404 — zgodnie z uzasadnieniem przyjetym
 * w `app/not-found.tsx` ("404 jest odpowiedzia publiczna").
 *
 * BEZ WLASNEGO `<main>` I BEZ `NotFoundScreen`
 * `(admin)/layout.tsx` renderuje juz `<main className="panel-main">`, a
 * `NotFoundScreen` otwiera wlasny `<main>`. Uzycie go tutaj dalo by DWA
 * landmarki `main` — czyli POW-1 z raportu QA E6, ten sam defekt WCAG 1.3.1,
 * ktorego powloka panelu celowo unika. Dlatego ekran stoi na istniejacych
 * klasach panelu i nie wnosi ani jednej reguly CSS.
 */
export default function PanelNotFound() {
  return (
    <section>
      <div className="panel-title-row">
        <div>
          <p className="panel-eyebrow">404</p>
          <h1>Nie znaleźliśmy tej pozycji</h1>
        </div>
      </div>

      <p className="panel-empty">
        Pozycja o tym identyfikatorze nie istnieje albo została usunięta.
        Wybierz ją z listy poniżej.
      </p>

      <div className="panel-actions">
        <Link className="panel-button" href="/panel">
          <Icon name="arrow-right" size={18} />
          Pulpit panelu
        </Link>
        <Link
          className="panel-button panel-button-ghost"
          href="/panel/szkolenia"
        >
          Szkolenia
        </Link>
        <Link
          className="panel-button panel-button-ghost"
          href="/panel/trenerzy"
        >
          Trenerzy
        </Link>
        <Link
          className="panel-button panel-button-ghost"
          href="/panel/zgloszenia"
        >
          Zgłoszenia
        </Link>
      </div>
    </section>
  );
}
