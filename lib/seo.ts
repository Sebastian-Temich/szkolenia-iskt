import type { Metadata } from "next";

export const SITE_URL = "https://szkolenia.iskt.pl";

export function canonicalUrl(path = "/") {
  const normalizedPath =
    path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `${SITE_URL}${normalizedPath}`;
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
      url: SITE_URL,
    },
  };
}
