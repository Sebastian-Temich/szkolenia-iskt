import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";

/**
 * Adres bazowy pochodzi WYLACZNIE z `NEXT_PUBLIC_SITE_URL` (ISK-375). Wcześniej
 * stała `SITE_URL` trzymała tu domenę produkcyjną, a zwalidowana zmienna
 * środowiskowa nie była czytana przez żaden kod aplikacji: operator płacił koszt
 * konfiguracji bez efektu, a deploy preview wyemitowałby `metadataBase`,
 * kanoniki, `sitemap` i `host` wskazujące na produkcję.
 *
 * Czytamy przy każdym wywołaniu, nie raz przy ewaluacji modułu — inaczej
 * wstrzyknięcie wartości w teście wymagałoby resetu modułów, co łatwo
 * przeoczyć i zacementować ponownie.
 *
 * Końcowy ukośnik obcinamy, bo adres podany jako `https://host/` dawałby
 * `https://host//szkolenia` — adres formalnie poprawny, ale inny niż ten,
 * który indeksuje wyszukiwarka, czyli znowu rozjechany kanonik.
 */
function siteBaseUrl() {
  return getSiteUrl().replace(/\/+$/, "");
}

export function canonicalUrl(path = "/") {
  const normalizedPath =
    path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `${siteBaseUrl()}${normalizedPath}`;
}

/**
 * Metadane korzenia mieszkają tutaj, a nie w `app/layout.tsx`, żeby dały się
 * przetestować bez importowania layoutu — ten ciągnie `next/font` i `globals.css`,
 * których runner testów jednostkowych nie obsłuży.
 */
export function buildRootMetadata(): Metadata {
  const url = canonicalUrl();

  return {
    metadataBase: new URL(url),
    title: "Szkolenia ISKT — wiedza, która działa",
    description: "Demonstracyjny katalog szkoleń ISKT dla osób i zespołów.",
    alternates: { canonical: url },
    // Zdjęcie `noindex` jest decyzją publikacyjną (wybór hostingu, ISK-367),
    // nie częścią tej poprawki.
    robots: { index: false, follow: false },
  };
}

export function buildPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const fullTitle = `${title} | ISKT`;
  const url = canonicalUrl(path);

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "pl_PL",
      siteName: "Szkolenia ISKT",
      title: fullTitle,
      description,
      url,
    },
  };
}

export function buildTrainingJsonLd(training: {
  slug: string;
  title: string;
  summary: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: training.title,
    description: training.summary,
    url: canonicalUrl(`/szkolenia/${training.slug}`),
    provider: {
      "@type": "Organization",
      name: "ISKT",
      url: canonicalUrl(),
    },
  };
}
