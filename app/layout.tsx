import type { Metadata } from "next";

import { buildRootMetadata } from "@/lib/seo";

import { interVariable } from "./fonts";
import "./globals.css";

// Treść metadanych siedzi w `lib/seo.ts` (ISK-375): adres bazowy pochodzi
// z `NEXT_PUBLIC_SITE_URL`, a testowalność wymaga modułu bez `next/font` i CSS.
export const metadata: Metadata = buildRootMetadata();

/**
 * Layout wspolny dla calej aplikacji: wylacznie `<html>`, `<body>` i arkusz
 * globalny. Naglowek i stopka marketingowa naleza do `app/(public)/layout.tsx`
 * — panel administratora ma wlasna powloke (`app/panel/(admin)/layout.tsx`)
 * i nie moze dziedziczyc publicznej nawigacji.
 *
 * Klasa `interVariable.variable` ustawia `--font-inter` na `<html>`; to ten sam
 * element co `:root`, z ktorego `@theme` czyta `--font-sans`. Bez tej klasy
 * `--font-sans` wskazywalby kroj, ktorego nikt nie wczytuje (ISK-364 / P1).
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={interVariable.variable}>
      <body>{children}</body>
    </html>
  );
}
