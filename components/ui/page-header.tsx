import type { ReactNode } from "react";

import { cx } from "./cx";
import { Eyebrow } from "./section-heading";

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Pasek breadcrumbow nad nadtytulem albo badge'y pod nim. */
  children?: ReactNode;
  /**
   * `id` naglowka H1 — dla sekcji, ktora wskazuje na niego `aria-labelledby`
   * (`/kontakt`). Bez tego nazwa dostepna sekcji wskazywalaby w pustke.
   */
  titleId?: string;
  className?: string;
};

/**
 * Naglowek podstrony: nadtytul + H1 + lead.
 *
 * JEDEN komponent dla WSZYSTKICH podstron. Wzorzec ma dwa prawie identyczne
 * bloki: katalog `max-width: 680px` / `margin-bottom: space-8`, trenerzy
 * `720px` / `space-10`. Roznica jest niezamierzona (ISK-400 punkt 4), wiec
 * zostaje 720 px i 2,5rem — polskie naglowki sa dlugie i wezsza kolumna
 * lamala H1 katalogu na trzy wiersze.
 *
 * ISK-412 / UX-Z2 — KOMPLET WIDOKOW, NIE TYLKO DWA.
 * Bramka UX wykazala, ze wymog "jeden `PageHeader`" z karty M1 (paragraf 3
 * planu) nie zostal domkniety: `/kontakt` skladal naglowek z `Eyebrow`
 * i `h1.ui-section-title` (41,6 px zamiast 48 px), a oba ekrany 404 uzywaly
 * `h1.empty-state-title` (21,6 px). Trzy widoki mialy wiec trzy rozne skale
 * H1 bez jednej decyzji za tym. Teraz kazdy widok publiczny przechodzi tym
 * komponentem, czyli H1 ma w produkcie DOKLADNIE JEDNA skale.
 *
 * H1 jest tu zawsze. Strona ma dokladnie jeden H1 (WCAG 1.3.1), wiec jesli
 * widok uzywa `PageHeader`, nie moze miec drugiego naglowka pierwszego
 * poziomu gdzie indziej.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  children,
  titleId,
  className,
}: Props) {
  return (
    <header className={cx("ui-page-header", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 className="ui-page-title" id={titleId}>
        {title}
      </h1>
      {lead ? <p className="ui-page-lead">{lead}</p> : null}
      {children}
    </header>
  );
}
