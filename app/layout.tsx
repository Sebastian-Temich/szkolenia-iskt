import type { Metadata } from "next";

import { SITE_URL } from "@/lib/seo";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Szkolenia ISKT — wiedza, która działa",
  description: "Demonstracyjny katalog szkoleń ISKT dla osób i zespołów.",
  alternates: { canonical: SITE_URL },
  robots: { index: false, follow: false },
};

/**
 * Layout wspolny dla calej aplikacji: wylacznie `<html>`, `<body>` i arkusz
 * globalny. Naglowek i stopka marketingowa naleza do `app/(public)/layout.tsx`
 * — panel administratora ma wlasna powloke (`app/panel/(admin)/layout.tsx`)
 * i nie moze dziedziczyc publicznej nawigacji.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
