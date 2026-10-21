import type { ReactNode } from "react";

import { cx } from "./cx";

type EyebrowProps = {
  children: ReactNode;
  /** Na panelu `--gradient-brand` / `--ink-900`: green-200 zamiast green-600. */
  onDark?: boolean;
  /** Kreska 22x2 px przed tekstem. Wzorzec ma ja w dziewieciu z jedenastu miejsc. */
  dash?: boolean;
  className?: string;
};

/**
 * Nadtytul sekcji. Kreska jest `aria-hidden`: to ornament, a nie tresc, wiec
 * czytnik ekranu nie ma go oglaszac. Renderuje sie jako `<p>`, nie `<h*>` —
 * nadtytul nie jest poziomem w konspekcie dokumentu, a wstawiony jako naglowek
 * tworzylby pusty poziom nad prawdziwym tytulem sekcji.
 */
export function Eyebrow({
  children,
  onDark = false,
  dash = true,
  className,
}: EyebrowProps) {
  return (
    <p className={cx("ui-eyebrow", onDark && "ui-eyebrow-on-dark", className)}>
      {dash ? <span className="ui-eyebrow-dash" aria-hidden="true" /> : null}
      {children}
    </p>
  );
}

type SectionHeadingProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Akapit wprowadzajacy pod tytulem. */
  lead?: ReactNode;
  /**
   * Akcja po prawej stronie tytulu ("Caly katalog →"). Przelacza uklad na
   * rzad; ponizej 768 px akcja schodzi pod naglowek.
   */
  action?: ReactNode;
  /** Blok wysrodkowany, max 680 px — uklad sekcji "Obszary" i "Jak to dziala". */
  align?: "start" | "center";
  onDark?: boolean;
  /**
   * Poziom naglowka. H2 jest domyslny, bo sekcja stoi pod H1 strony; sekcja
   * zagnieżdżona w kolumnie szczegolu ma podac `h3`, zeby nie zrobic dziury
   * w konspekcie (WCAG 1.3.1).
   */
  as?: "h2" | "h3";
  className?: string;
};

/**
 * Naglowek sekcji: nadtytul + H2 + lead, opcjonalnie z akcja po prawej.
 *
 * Skala tytulu jest JEDNA: `clamp(2rem, 3.4vw, 2.6rem)` / 800 / `-0.02em`.
 * Wzorzec ma pod tym samym pojeciem cztery wartosci `letter-spacing` eyebrow
 * i dwie skale H2 podsekcji (1,6rem na kursie, 1,5rem u trenera) — ISK-400
 * punkt 4 kaze to ujednolicic, a nie odtworzyc. Podsekcje maja wlasny
 * komponent `SubsectionTitle`.
 */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  action,
  align = "start",
  onDark = false,
  as: Tag = "h2",
  className,
}: SectionHeadingProps) {
  const text = (
    <>
      {eyebrow ? <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow> : null}
      <Tag className="ui-section-title">{title}</Tag>
      {lead ? <p className="ui-section-lead">{lead}</p> : null}
    </>
  );

  return (
    <div
      className={cx(
        "ui-section-heading",
        align === "center" && "ui-section-heading-center",
        // `Boolean(...)`, bo `ReactNode` obejmuje `number`: samo `action &&`
        // zwrociloby `0` dla akcji bedacej liczba, a `cx` przyjmuje napisy.
        Boolean(action) && "ui-section-heading-row",
        onDark && "ui-section-heading-on-dark",
        className,
      )}
    >
      {action ? (
        <>
          <div className="ui-section-heading-text">{text}</div>
          {action}
        </>
      ) : (
        text
      )}
    </div>
  );
}

/**
 * Tytul podsekcji w kolumnie tresci ("Czego sie nauczysz", "Program
 * szkolenia", "Wyksztalcenie"). Jedna skala 1,6rem dla wszystkich widokow.
 */
export function SubsectionTitle({
  children,
  as: Tag = "h2",
  className,
}: {
  children: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return <Tag className={cx("ui-subsection-title", className)}>{children}</Tag>;
}
