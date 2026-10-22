"use client";

import { useActionState } from "react";

import { Field, Icon, Input } from "@/components/ui";

import { login } from "./actions";

/**
 * Formularz logowania do panelu (ISK-402 / M3).
 *
 * `noValidate` jest SWIADOME. Z natywna walidacja przegladarka blokuje
 * wyslanie i pokazuje wlasna chmurke, ktora czytniki ekranu oglaszaja
 * niejednolicie, a klawiatura nie przywola ponownie. Bez niej zadanie dochodzi
 * do akcji serwerowej, a ta zwraca blad PRZY POLU: `aria-invalid` +
 * `aria-describedby` wyliczane przez `Field`. Atrybut `required` zostaje, bo
 * niesie `aria-required` dla czytnika — zmienia sie tylko to, kto pokazuje
 * komunikat.
 *
 * Wzorzec ma tu jeden komunikat bez wskazania pola i formularz, ktory da sie
 * wyslac dowolna liczbe razy (brak stanu `pending`).
 */
export function LoginForm() {
  const [state, action, pending] = useActionState(login, { message: "" });
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={action} className="panel-form" noValidate>
      <Field id="email" label="E-mail" error={emailError} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          error={emailError}
        />
      </Field>
      <Field id="password" label="Hasło" error={passwordError} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={passwordError}
        />
      </Field>

      {/* Odmowa uwierzytelnienia — jedyne miejsce w panelu z `role="alert"`.
          Flash operacji uzywa `role="status"`, bo nie wolno przerywac czytnika
          w trakcie pracy; tutaj uzytkownik CZEKA na wynik proby logowania,
          wiec przerwanie jest dokladnie tym, czego oczekuje. */}
      {state.message ? (
        <p className="panel-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <button className="panel-button" disabled={pending} type="submit">
        {pending ? "Logowanie…" : "Zaloguj się"}
        {pending ? null : <Icon name="arrow-right" size={18} />}
      </button>
    </form>
  );
}
