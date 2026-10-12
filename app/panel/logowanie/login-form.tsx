"use client";

import { useActionState } from "react";

import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { message: "" });
  return (
    <form action={action} className="panel-form">
      <label htmlFor="email">E-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
      />
      <label htmlFor="password">Hasło</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.message ? (
        <p className="panel-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <button className="panel-button" disabled={pending} type="submit">
        {pending ? "Logowanie…" : "Zaloguj się"}
      </button>
    </form>
  );
}
