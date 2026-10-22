import type { ComponentProps, ReactNode } from "react";

import { cx } from "./cx";
import { Icon } from "./icon";

/**
 * Wspolna obudowa pola: etykieta, podpowiedz, komunikat bledu.
 *
 * `id` jest WYMAGANE i nie ma wartosci domyslnej ani generowanej. Powod jest
 * praktyczny: identyfikator musi byc taki sam na serwerze i po hydratacji,
 * a `useId` dzialalby tylko w komponencie klienckim — polowa formularzy w tym
 * projekcie renderuje sie na serwerze. Wymuszenie jawnego `id` jest tez
 * jedynym sposobem, by `label htmlFor` NIE dalo sie pominac: wzorzec owija
 * kontrolke etykieta bez `htmlFor` albo stawia luzny `span`, wiec w panelu
 * klikniecie w etykiete nie ustawia focusu, a czytnik ekranu czyta pole jako
 * nieopisane (ISK-399 / M1 punkt 5).
 */

type FieldProps = {
  /** Ten sam `id`, ktory dostaje kontrolka. Wiaze `label htmlFor` z polem. */
  id: string;
  label: ReactNode;
  /** Podpowiedz pod polem. Trafia do `aria-describedby` kontrolki. */
  hint?: ReactNode;
  /**
   * Komunikat bledu. Trafia do `aria-describedby` i ustawia `aria-invalid`.
   * Region bledu ma `aria-live="polite"` i jest w DOM ZAWSZE — pusty, dopoki
   * bledu nie ma. Region wstawiony do drzewa razem z tekstem czesto nie
   * zostaje ogloszony, bo czytnik ekranu nie obserwowal go w momencie zmiany.
   */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

/** Identyfikatory opisow pola — te same po stronie `Field` i kontrolki. */
export function fieldDescribedBy({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: unknown;
  error?: unknown;
}): string | undefined {
  return (
    cx(hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined) ??
    undefined
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx("ui-field", className)}>
      <label className="ui-field-label" htmlFor={id}>
        {label}
        {required ? (
          // Gwiazdka jest ornamentem — wymog niesie `required`/`aria-required`
          // na kontrolce. Ogloszona przez czytnik ekranu brzmialaby "gwiazdka".
          <span className="ui-field-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p className="ui-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <p className="ui-field-error" id={`${id}-error`} aria-live="polite">
        {error}
      </p>
    </div>
  );
}

type ControlShared = {
  id: string;
  error?: unknown;
  hint?: unknown;
  className?: string;
};

function controlProps({ id, error, hint, className }: ControlShared) {
  return {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": fieldDescribedBy({ id, hint, error }),
    className,
  };
}

export function Input({
  id,
  error,
  hint,
  className,
  ...rest
}: ControlShared & Omit<ComponentProps<"input">, "className" | "id">) {
  return (
    <input
      {...rest}
      {...controlProps({
        id,
        error,
        hint,
        className: cx("ui-field-control", className),
      })}
    />
  );
}

export function Textarea({
  id,
  error,
  hint,
  className,
  rows = 4,
  ...rest
}: ControlShared & Omit<ComponentProps<"textarea">, "className" | "id">) {
  return (
    <textarea
      {...rest}
      rows={rows}
      {...controlProps({
        id,
        error,
        hint,
        className: cx("ui-field-control", "ui-textarea", className),
      })}
    />
  );
}

/**
 * Lista rozwijana z wlasna strzalka.
 *
 * `appearance: none` zdejmuje karet systemowy, wiec strzalke MUSIMY narysowac
 * sami — wzorzec zdejmuje go w formularzu kontaktowym i nie rysuje nic, czyli
 * pole wyglada jak zwykly input i nie podpowiada, ze da sie je rozwinac.
 * Strzalka ma `pointer-events: none`, zeby klikniecie w nia trafialo w `select`.
 */
export function Select({
  id,
  error,
  hint,
  className,
  children,
  ...rest
}: ControlShared & Omit<ComponentProps<"select">, "className" | "id">) {
  return (
    <span className="ui-select-wrap">
      <select
        {...rest}
        {...controlProps({
          id,
          error,
          hint,
          className: cx("ui-field-control", "ui-select", className),
        })}
      >
        {children}
      </select>
      <span className="ui-select-caret">
        <Icon name="chevron-down" size={18} />
      </span>
    </span>
  );
}

/**
 * Pole wyszukiwania: pigulka z ikona lupy w `left: 14px`.
 *
 * `type="search"` zamiast `text`: daje natywny przycisk czyszczenia i wlasciwa
 * role dla czytnika ekranu. Lupa jest `aria-hidden`, bo nazwe pola niesie
 * etykieta z `Field`.
 */
export function SearchInput({
  id,
  error,
  hint,
  className,
  ...rest
}: ControlShared & Omit<ComponentProps<"input">, "className" | "id">) {
  return (
    <span className="ui-search">
      <span className="ui-search-icon">
        <Icon name="search" size={18} />
      </span>
      <Input
        {...rest}
        type={rest.type ?? "search"}
        id={id}
        error={error}
        hint={hint}
        className={className}
      />
    </span>
  );
}

/**
 * Pole wyboru z etykieta w jednym rzedzie.
 *
 * Klikalny jest caly `label`, nie sam kwadrat 18 px: rzad ma `min-height`
 * 44 px, czyli minimum celu dotykowego przyjete w bramkach UX tego projektu
 * (WCAG 2.1 AA, 2.5.5). Sam kwadrat ma we wzorcu 18x18 px i jest jedynym
 * celem klikniecia.
 *
 * Komunikat bledu jest tu w komponencie, a nie w `Field`, bo zgoda RODO nie
 * ma etykiety nad kontrolka — tekst zgody JEST etykieta.
 */
export function Checkbox({
  id,
  label,
  error,
  boxed = false,
  className,
  ...rest
}: ControlShared & {
  label: ReactNode;
  /** Wariant w obudowie kontrolki (panel) zamiast golego rzedu. */
  boxed?: boolean;
} & Omit<ComponentProps<"input">, "className" | "id" | "type">) {
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div className={cx("ui-field", className)}>
      <label
        className={cx("ui-checkbox", boxed && "ui-checkbox-boxed")}
        htmlFor={id}
      >
        <input
          {...rest}
          type="checkbox"
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <span>{label}</span>
      </label>
      <p className="ui-field-error" id={`${id}-error`} aria-live="polite">
        {error as ReactNode}
      </p>
    </div>
  );
}
