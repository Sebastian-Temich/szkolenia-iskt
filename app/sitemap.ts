import type { MetadataRoute } from "next";
import { getTrainings } from "@/lib/public-catalog";
import { canonicalUrl } from "@/lib/seo";

// Bez tego sitemap zostaje zamrozony ze stanu z builda, a build w bramce
// `quality` biegnie bez kluczy Supabase — lista szkolen zostalaby pusta.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const trainings = await getTrainings();
  const staticPaths = ["/", "/szkolenia", "/trenerzy", "/kontakt"];
  return [
    ...staticPaths.map((path) => ({
      url: canonicalUrl(path),
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.8,
    })),
    ...trainings.map((training) => ({
      url: canonicalUrl(`/szkolenia/${training.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
