import { describe, expect, it } from "vitest";

import {
  buildPageMetadata,
  buildTrainingJsonLd,
  canonicalUrl,
} from "@/lib/seo";

describe("canonicalUrl", () => {
  it("buduje kanoniczny URL bez podwójnych ukośników", () => {
    expect(canonicalUrl("/szkolenia/wprowadzenie-do-ai")).toBe(
      "https://szkolenia.iskt.pl/szkolenia/wprowadzenie-do-ai",
    );
  });
});

describe("buildPageMetadata", () => {
  it("zwraca title, description, canonical i Open Graph dla podstrony", () => {
    const metadata = buildPageMetadata({
      title: "Katalog szkoleń",
      description: "Znajdź szkolenie dla swojego zespołu.",
      path: "/szkolenia",
    });

    expect(metadata).toMatchObject({
      title: "Katalog szkoleń | ISKT",
      description: "Znajdź szkolenie dla swojego zespołu.",
      alternates: { canonical: "https://szkolenia.iskt.pl/szkolenia" },
      openGraph: {
        title: "Katalog szkoleń | ISKT",
        description: "Znajdź szkolenie dla swojego zespołu.",
        url: "https://szkolenia.iskt.pl/szkolenia",
      },
    });
  });
});

describe("buildTrainingJsonLd", () => {
  it("mapuje demonstracyjne szkolenie na Course bez ceny i terminu", () => {
    expect(
      buildTrainingJsonLd({
        slug: "wprowadzenie-do-ai",
        title: "[DEMO] Wprowadzenie do AI",
        summary: "Opis demonstracyjny.",
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Course",
      name: "[DEMO] Wprowadzenie do AI",
      description: "Opis demonstracyjny.",
      url: "https://szkolenia.iskt.pl/szkolenia/wprowadzenie-do-ai",
      provider: {
        "@type": "Organization",
        name: "ISKT",
        url: "https://szkolenia.iskt.pl",
      },
    });
  });
});
