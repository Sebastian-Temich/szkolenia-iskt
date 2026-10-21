import Link from "next/link";
import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/panel/auth";

import { logout } from "../logowanie/actions";

export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="panel-shell">
      <header className="panel-header">
        <Link className="panel-brand" href="/panel">
          ISKT <span>Panel</span>
        </Link>
        <nav aria-label="Nawigacja panelu">
          <Link href="/panel/szkolenia">Szkolenia</Link>
          <Link href="/panel/trenerzy">Trenerzy</Link>
          <Link href="/panel/zgloszenia">Zgłoszenia</Link>
        </nav>
        <form action={logout}>
          <button className="panel-link-button">Wyloguj</button>
        </form>
      </header>
      <main className="panel-main">{children}</main>
    </div>
  );
}
