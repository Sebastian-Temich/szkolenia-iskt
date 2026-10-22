import type { ComponentProps } from "react";

import { cx } from "./cx";

export type BadgeTone =
  | "tint"
  | "outline"
  | "soft"
  | "solid"
  /** Nad pasmem gradientu w karcie wyroznionej — tlo musi byc kryjace. */
  | "on-media";

/**
 * Etykieta stanu albo kategorii. Wzorzec ma czternascie wariantow roznicych
 * sie o 0,5 px paddingu i 0,5 px kroju; tu jest jedna forma i piec tonow.
 *
 * Badge jest TYLKO tekstem. Nie przyjmuje `onClick` ani `href`: klikalna
 * pastylka to `FilterPill`, a nie badge z dopiętym handlerem — mialaby role
 * `generic` i nie dalaby sie uzyc z klawiatury.
 */
export function Badge({
  tone = "tint",
  className,
  children,
  ...rest
}: { tone?: BadgeTone } & Omit<ComponentProps<"span">, "className"> & {
    className?: string;
  }) {
  return (
    <span {...rest} className={cx("ui-badge", `ui-badge-${tone}`, className)}>
      {children}
    </span>
  );
}
