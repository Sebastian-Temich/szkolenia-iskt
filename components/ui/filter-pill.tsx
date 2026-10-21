import type { ComponentProps, ReactNode } from "react";

import { cx } from "./cx";

type Shared = {
  active?: boolean;
  className?: string;
  children?: ReactNode;
};

export function filterPillClassName({ active = false, className }: Shared) {
  return cx("ui-filterpill", active && "ui-filterpill-active", className);
}

/**
 * Ta sama pigulka jako przycisk przelacznika — dla wyboru wielokrotnego
 * (chipy kompetencji w panelu), gdzie stan nie jest adresem strony.
 *
 * `aria-pressed` zamiast `aria-current`: to przelacznik wlacz/wylacz, a nie
 * wskazanie biezacej pozycji w zbiorze.
 */
export function FilterPillToggle({
  active = false,
  className,
  children,
  ...rest
}: Shared & Omit<ComponentProps<"button">, "className">) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      className={filterPillClassName({ active, className })}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
