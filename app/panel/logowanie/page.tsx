import { redirect } from "next/navigation";

import { getPanelAccess } from "@/lib/panel/auth";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const access = await getPanelAccess();
  if (access.status === "admin") redirect("/panel");
  return (
    <main className="panel-login-shell">
      <section className="panel-login-card" aria-labelledby="login-title">
        <p className="panel-eyebrow">Panel administratora</p>
        <h1 id="login-title">Zaloguj się</h1>
        <p>Zarządzaj katalogiem szkoleń, trenerami i zgłoszeniami.</p>
        <LoginForm />
      </section>
    </main>
  );
}
