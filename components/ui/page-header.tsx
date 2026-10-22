import type { ReactNode } from "react";

import { cx } from "./cx";
import { Eyebrow } from "./section-heading";

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Pasek breadcrumbow nad nadtytulem albo badge'y pod nim. */
  children?: ReactNode;
  className?: string;
};

/**
 * Naglowek podstrony: nadtytul + H1 + lead.
 *
 * JEDEN komponent dla katalogu i trenerow. Wzorzec ma dwa prawie identyczne
 * bloki: katalog `max-width: 680px` / `margin-bottom: space-8`, trenerzy
 * `720px` / `space-10`. Roznica jest niezamierzona (ISK-400 punkt 4), wiec
 * zostaje 720 px i 2,5rem — polskie naglowki sa dlugie i wezsza kolumna
 * lamala H1 katalogu na trzy wiersze.
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
  className,
}: Props) {
  return (
    <header className={cx("ui-page-header", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 className="ui-page-title">{title}</h1>
      {lead ? <p className="ui-page-lead">{lead}</p> : null}
      {children}
    </header>
  );
}
