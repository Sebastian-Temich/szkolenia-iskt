import type { ComponentProps, ReactNode } from "react";

import { cx } from "./cx";

export type ButtonVariant = "primary" | "ghost" | "light" | "neutral";
/** 44 / 46 / 54 / 56 px. 44 px to minimum celu dotykowego (WCAG 2.1 AA, 2.5.5). */
export type ButtonSize = "sm" | "md" | "lg" | "xl";

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Przycisk na pelna szerokosc kolumny (karta ceny, formularz, panel). */
  block?: boolean;
  className?: string;
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: Shared = {}): string {
  return (
    cx(
      "ui-button",
      `ui-button-${size}`,
      `ui-button-${variant}`,
      block && "ui-button-block",
      className,
    ) ?? ""
  );
}

type ButtonProps = Shared &
  Omit<ComponentProps<"button">, "className"> & {
    /**
     * Akcja w toku. Ustawia `disabled` i `aria-busy`, wiec jeden formularz nie
     * da sie wyslac dwa razy. Wzorzec nie ma tego stanu w ogole i jego
     * formularz kontaktowy mozna wyslac dowolna liczbe razy klikajac szybko
     * (ISK-399 / M1 punkt 5).
     */
    pending?: boolean;
  };

/**
 * Przycisk. `type="button"` jest domyslne swiadomie: HTML domyslnie daje
 * `submit`, co w formularzu zamienia kazdy przycisk pomocniczy w wysylke.
 * Przycisk wysylajacy musi wiec podac `type="submit"` jawnie.
 */
export function Button({
  variant,
  size,
  block,
  className,
  pending = false,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClassName({ variant, size, block, className })}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ButtonProps, "children" | "block"> & {
  /**
   * Nazwa dostepna. Wymagana — przycisk z sama ikona nie ma tekstu, wiec bez
   * niej czytnik ekranu oglasza "przycisk" i nic wiecej. Wzorzec uzywa tu
   * `title`, ktorego klawiatura nie pokazuje nigdy (ISK-399 / M1 punkt 5).
   */
  label: string;
  children: ReactNode;
};

export function IconButton({
  label,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      {...rest}
      aria-label={label}
      className={cx("ui-button-icon", className)}
    >
      {children}
    </Button>
  );
}
