/**
 * Warianty nawigacyjne komponentow fundamentu — wszystko, co wie o routingu.
 *
 * DLACZEGO OSOBNY MODUL
 * `next/link` jest jedyna zaleznoscia frameworkowa w tej warstwie. Trzymany
 * razem z `Button` czy `Card` wciagalby Next do kazdego kontekstu, ktory
 * importuje fundament — w tym do bramki pomiarowej `tests/e2e/fundament-ui.spec.ts`,
 * ktora uruchamia loader ESM Playwrighta i nie potrafi rozwiazac `next/link`
 * (brak rozszerzenia w sciezce). Rozdzial oznacza, ze warstwa prezentacji da
 * sie zmierzyc i przetestowac bez frameworka, a tutaj zostaje sama decyzja
 * "to jest nawigacja".
 *
 * Wszystkie trzy komponenty sa LINKAMI, nigdy `button`ami z `onClick` —
 * wzorzec robi odwrotnie i traci na tym nawigacje klawiatura, otwieranie
 * w nowej karcie, deep-linki i SEO (granica zapisana w ISK-399).
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button";
import { cardClassName, type CardPadding, type CardTone } from "./card";
import { filterPillClassName } from "./filter-pill";

type LinkProps = Omit<ComponentProps<typeof Link>, "className">;

/** Przycisk-link. Nie ma `disabled` ani `type` — link ich nie zna. */
export function ButtonLink({
  variant,
  size,
  block,
  className,
  children,
  ...rest
}: LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      {...rest}
      className={buttonClassName({ variant, size, block, className })}
    >
      {children}
    </Link>
  );
}

/**
 * Karta jako nawigacja — jedyny wariant karty z podniesieniem w hover.
 *
 * Cala karta jest jednym linkiem, wiec w jej wnetrzu NIE moze stanac drugi
 * link ani przycisk: zagniezdzony element interaktywny to niepoprawny HTML
 * i drugi przystanek w nawigacji Tabem po tej samej tresci.
 */
export function CardLink({
  tone,
  padding,
  className,
  children,
  ...rest
}: LinkProps & {
  tone?: CardTone;
  padding?: CardPadding;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      {...rest}
      className={cardClassName({ tone, padding, className }, true)}
    >
      {children}
    </Link>
  );
}

/**
 * Pigulkowy filtr katalogu.
 *
 * Filtr w produkcie jest stanem w adresie (`?category=…`), nie stanem
 * w kliencie, wiec jego naturalna forma to link: da sie go otworzyc w nowej
 * karcie, wkleic komus i zindeksowac.
 *
 * `aria-current="page"` na pigulce aktywnej: bez tego stan wybrany niesie
 * wylacznie kolor tla (WCAG 1.4.1), a czytnik ekranu czyta wszystkie pigulki
 * identycznie.
 */
export function FilterPillLink({
  active = false,
  className,
  children,
  ...rest
}: LinkProps & {
  active?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      {...rest}
      className={filterPillClassName({ active, className })}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
