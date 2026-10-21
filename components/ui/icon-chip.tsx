import type { ReactNode } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export type IconChipSize = "xs" | "sm" | "md" | "lg" | "xl";
export type IconChipTone =
  /** green-50 / green-700 — podstawowy wariant wzorca. */
  | "soft"
  /** green-700 / bialy — sekcja procesu. */
  | "solid"
  /** Bialy welon na panelu `--gradient-brand` lub `--ink-900`. */
  | "on-dark"
  /** Gradient marki — krazek z inicjalami. */
  | "brand";

/** Krawedz kwadratu chipa w px, zgodnie z klasami `.ui-iconchip-*`. */
const CHIP_PX: Record<IconChipSize, number> = {
  xs: 28,
  sm: 36,
  md: 40,
  lg: 48,
  xl: 56,
};

type Props = {
  size?: IconChipSize;
  tone?: IconChipTone;
  /** Krazek zamiast zaokraglonego kwadratu. */
  circle?: boolean;
  className?: string;
} & (
  | {
      /** Ikona z zestawu. Zawsze dekoracyjna — chip stoi obok tekstu. */
      icon: IconName;
      children?: never;
    }
  | {
      icon?: never;
      /** Tresc wlasna: inicjaly, numer kroku, krotki znak. */
      children: ReactNode;
    }
);

/**
 * Kwadratowy (lub okragly) pojemnik na ikone albo na inicjaly.
 *
 * Rozmiar ikony to 0,45 krawedzi chipa, zaokraglone do parzystej liczby px —
 * wzorzec dobieral te pary recznie (chip 40 / ikona 18, chip 48 / ikona 22,
 * chip 56 / ikona 26) i rozjechal sie na dwunastu rozmiarach chipa. Jedna
 * proporcja daje te same wartosci dla rozmiarow, ktore zostaly, i nie wymaga
 * od wolajacego pamietania tabeli.
 *
 * Chip NIE przyjmuje `aria-label` dla ikony: jesli ikona niesie znaczenie,
 * ktorego nie ma w sasiednim tekscie, to znaczenie nalezy do tekstu, nie do
 * ornamentu. Ikona jest tu zawsze `aria-hidden`.
 */
export function IconChip({
  size = "md",
  tone = "soft",
  circle = false,
  className,
  icon,
  children,
}: Props) {
  const iconPx = Math.round((CHIP_PX[size] * 0.45) / 2) * 2;

  return (
    <span
      className={cx(
        "ui-iconchip",
        `ui-iconchip-${size}`,
        `ui-iconchip-${tone}`,
        circle && "ui-iconchip-circle",
        className,
      )}
      aria-hidden={icon ? true : undefined}
    >
      {icon ? <Icon name={icon} size={iconPx} /> : children}
    </span>
  );
}
