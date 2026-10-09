import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Szkolenia ISKT",
  description: "Serwis oferty szkoleń ISKT — środowisko lokalne MVP.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
