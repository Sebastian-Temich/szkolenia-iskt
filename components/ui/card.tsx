import type { ComponentProps } from "react";

import { cx } from "./cx";

export type CardTone = "plain" | "tint" | "dark" | "glass";
/** `roomy` = padding 2rem, `flush` = bez paddingu (karta z pasmem medialnym). */
export type CardPadding = "normal" | "roomy" | "flush";

type Shared = {
  tone?: CardTone;
  padding?: CardPadding;
  className?: string;
};

export function cardClassName(
  { tone = "plain", padding = "normal", className }: Shared,
  interactive: boolean,
): string | undefined {
  return cx(
    "ui-card",
    tone !== "plain" && `ui-card-${tone}`,
    padding !== "normal" && `ui-card-${padding}`,
    // Podniesienie w hover TYLKO dla kart, ktore naprawde sa linkiem albo
    // przyciskiem. Wzorzec podnosi tez karty nieklikalne, czyli obiecuje
    // interakcje, ktorej nie ma.
    interactive && "ui-card-interactive",
    className,
  );
}

/** Karta nieklikalna: brak hover, brak `cursor: pointer`. */
export function Card({
  tone,
  padding,
  className,
  children,
  ...rest
}: Shared & Omit<ComponentProps<"div">, "className">) {
  return (
    <div
      {...rest}
      className={cardClassName({ tone, padding, className }, false)}
    >
      {children}
    </div>
  );
}
