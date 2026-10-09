import type { Metadata } from "next";
import Link from "next/link";

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
      <body className="flex min-h-screen flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t">
          <div className="max-w-container px-gutter mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 py-6 text-sm">
            <span className="text-secondary">© Szkolenia ISKT</span>
            <Link href="/polityka-prywatnosci" className="text-primary hover:underline">
              Polityka prywatności
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
