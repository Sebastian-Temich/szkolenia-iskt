import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";

import { logout } from "../logowanie/actions";
import { PanelNav } from "./panel-nav";

/**
 * Powloka panelu (ISK-402 / M3).
 *
 * Wzorzec wspoldzieli z panelem naglowek i stopke strony publicznej, razem
 * z marketingowym CTA „Zapisz sie" i linkami Obszary/Katalog/Dofinansowania.
 * Produkt ma WLASNA powloke i tak zostaje — POW-1 z raportu QA E6 to dokladnie
 * ten defekt: panel renderowany w publicznym layoucie mial dwa landmarki
 * `banner`, dwie nawigacje i marketingowa stopke (WCAG 1.3.1). Powrot do
 * wspolnego naglowka bylby regresja UX i bezpieczenstwa, nie parytetem.
 */
export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { email } = await requireAdmin();
  return (
    <div className="panel-shell">
      <header className="panel-header">
        <Link className="panel-brand" href="/panel">
          ISKT <span>Panel</span>
        </Link>
        <PanelNav />
        {email ? (
          <span className="panel-account">
            {/* Inicjal jest ornamentem obok pelnego adresu — bez
                `aria-hidden` czytnik przeczytalby pierwsza litere dwa razy. */}
            <span className="panel-avatar" aria-hidden="true">
              {email.slice(0, 1).toUpperCase()}
            </span>
            {email}
          </span>
        ) : null}
        <form action={logout}>
          <button className="panel-button panel-button-ghost" type="submit">
            <Icon name="log-out" size={16} />
            Wyloguj
          </button>
        </form>
      </header>
      <main className="panel-main">{children}</main>
    </div>
  );
}
