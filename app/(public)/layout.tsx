import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Powloka widokow publicznych: naglowek marketingowy, tresc, stopka.
 *
 * Mieszkala wczesniej w `app/layout.tsx`, wiec panel administratora
 * dziedziczyl ja razem z `<html>` — kazdy jego widok mial dwa landmarki
 * `banner` i dwie nawigacje (defekt POW-1, `docs/qa/raport-e6.md`). Grupa
 * tras `(public)` nie zmienia adresow URL, a odcina panel od tej powloki.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
