import { redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { getPanelAccess } from "@/lib/panel/auth";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const access = await getPanelAccess();
  if (access.status === "admin") redirect("/panel");
  return (
    <main className="panel-login-shell">
      <section className="panel-login-card" aria-labelledby="login-title">
        {/* Kafel z zamkiem nad naglowkiem — forma wzorca (52 px, `--green-50`
            pod `--green-700`). Ikona jest dekoracja obok tekstu, wiec idzie
            bez `label`: `Icon` oznacza ja wtedy `aria-hidden`. */}
        <span className="panel-login-mark">
          <Icon name="lock" size={24} />
        </span>
        <div className="panel-login-head">
          {/* H1 „Panel administratora" wprost z karty ISK-402 i ze wzorca.
              Wczesniej stal tu „Zaloguj sie", a „Panel administratora" bylo
              nadrzednym `panel-eyebrow` — czyli dokladnie odwrotnie. Zmiana
              pociagnela asercje w `tests/e2e/panel.spec.ts`. */}
          <h1 id="login-title">Panel administratora</h1>
          <p>
            Zaloguj się, aby zarządzać szkoleniami, trenerami i zgłoszeniami.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
