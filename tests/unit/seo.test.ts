import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import {
  buildPageMetadata,
  buildRootMetadata,
  buildTrainingJsonLd,
  canonicalUrl,
} from "@/lib/seo";

// Adres bazowy jest WSTRZYKIWANY, a nie asertowany jako produkcyjny.
// Wcześniejsza wersja tego pliku zapisywała `https://szkolenia.iskt.pl` w trzech
// miejscach i tym samym cementowała defekt ISK-375: `lib/seo.ts` ignorowało
// `NEXT_PUBLIC_SITE_URL`, więc deploy preview wyemitowałby kanoniki produkcyjne,
// a bramka nadal świeciłaby na zielono. Wartości poniżej są umyślnie testowe
// (domena `.invalid`, RFC 2606) — gdyby ktoś wrócił do stałej w kodzie, te testy
// padną, bo żadna z nich nie jest adresem produkcyjnym.
const PREVIEW = "https://preview.szkolenia.example.invalid";
const PRODUCTION_LIKE = "https://szkolenia.example.invalid";

function withSiteUrl(value: string) {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canonicalUrl", () => {
  it("buduje kanoniczny URL bez podwójnych ukośników", () => {
    withSiteUrl(PRODUCTION_LIKE);
    expect(canonicalUrl("/szkolenia/wprowadzenie-do-ai")).toBe(
      `${PRODUCTION_LIKE}/szkolenia/wprowadzenie-do-ai`,
    );
  });

  it("zwraca sam adres bazowy dla korzenia", () => {
    withSiteUrl(PRODUCTION_LIKE);
    expect(canonicalUrl()).toBe(PRODUCTION_LIKE);
    expect(canonicalUrl("/")).toBe(PRODUCTION_LIKE);
  });

  it("obcina końcowy ukośnik z konfiguracji środowiska", () => {
    withSiteUrl(`${PREVIEW}/`);
    expect(canonicalUrl()).toBe(PREVIEW);
    expect(canonicalUrl("/szkolenia")).toBe(`${PREVIEW}/szkolenia`);
  });

  it("czyta adres przy każdym wywołaniu, więc zmiana środowiska zmienia wynik", () => {
    withSiteUrl(PRODUCTION_LIKE);
    expect(canonicalUrl("/kontakt")).toBe(`${PRODUCTION_LIKE}/kontakt`);

    withSiteUrl(PREVIEW);
    expect(canonicalUrl("/kontakt")).toBe(`${PREVIEW}/kontakt`);
  });

  it("zgłasza brak konfiguracji zamiast podstawiać domenę produkcyjną", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(() => canonicalUrl("/szkolenia")).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe("buildRootMetadata", () => {
  it("wiąże metadataBase i kanonik korzenia z NEXT_PUBLIC_SITE_URL", () => {
    withSiteUrl(PREVIEW);
    const metadata = buildRootMetadata();

    expect(metadata.metadataBase?.toString()).toBe(`${PREVIEW}/`);
    expect(metadata.alternates?.canonical).toBe(PREVIEW);
    // Zdjęcie `noindex` nie jest zakresem tej karty (ISK-375).
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("podmiana adresu podmienia metadataBase", () => {
    withSiteUrl(PRODUCTION_LIKE);
    expect(buildRootMetadata().metadataBase?.toString()).toBe(
      `${PRODUCTION_LIKE}/`,
    );

    withSiteUrl(PREVIEW);
    expect(buildRootMetadata().metadataBase?.toString()).toBe(`${PREVIEW}/`);
  });
});

describe("buildPageMetadata", () => {
  it("zwraca title, description, canonical i Open Graph dla podstrony", () => {
    withSiteUrl(PRODUCTION_LIKE);
    const metadata = buildPageMetadata({
      title: "Katalog szkoleń",
      description: "Znajdź szkolenie dla swojego zespołu.",
      path: "/szkolenia",
    });

    expect(metadata).toMatchObject({
      title: "Katalog szkoleń | ISKT",
      description: "Znajdź szkolenie dla swojego zespołu.",
      alternates: { canonical: `${PRODUCTION_LIKE}/szkolenia` },
      openGraph: {
        title: "Katalog szkoleń | ISKT",
        description: "Znajdź szkolenie dla swojego zespołu.",
        url: `${PRODUCTION_LIKE}/szkolenia`,
      },
    });
  });

  it("kanonik podstrony idzie za adresem środowiska", () => {
    withSiteUrl(PREVIEW);
    const metadata = buildPageMetadata({
      title: "Katalog szkoleń",
      description: "Znajdź szkolenie dla swojego zespołu.",
      path: "/szkolenia",
    });

    expect(metadata.alternates?.canonical).toBe(`${PREVIEW}/szkolenia`);
    expect(JSON.stringify(metadata)).not.toContain("szkolenia.iskt.pl");
  });
});

describe("buildTrainingJsonLd", () => {
  it("mapuje demonstracyjne szkolenie na Course bez ceny i terminu", () => {
    withSiteUrl(PRODUCTION_LIKE);
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
      url: `${PRODUCTION_LIKE}/szkolenia/wprowadzenie-do-ai`,
      provider: {
        "@type": "Organization",
        name: "ISKT",
        url: PRODUCTION_LIKE,
      },
    });
  });

  it("adresy w JSON-LD idą za adresem środowiska", () => {
    withSiteUrl(PREVIEW);
    const jsonLd = buildTrainingJsonLd({
      slug: "wprowadzenie-do-ai",
      title: "[DEMO] Wprowadzenie do AI",
      summary: "Opis demonstracyjny.",
    });

    expect(jsonLd.url).toBe(`${PREVIEW}/szkolenia/wprowadzenie-do-ai`);
    expect(jsonLd.provider.url).toBe(PREVIEW);
  });
});

describe("app/robots.ts", () => {
  it("sitemap i host idą za NEXT_PUBLIC_SITE_URL", () => {
    withSiteUrl(PREVIEW);
    expect(robots()).toEqual({
      rules: { userAgent: "*", disallow: "/" },
      sitemap: `${PREVIEW}/sitemap.xml`,
      host: PREVIEW,
    });

    withSiteUrl(PRODUCTION_LIKE);
    expect(robots()).toMatchObject({
      sitemap: `${PRODUCTION_LIKE}/sitemap.xml`,
      host: PRODUCTION_LIKE,
    });
  });

  it("zostaje na disallow: / — ta karta nie jest publikacją", () => {
    withSiteUrl(PREVIEW);
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
