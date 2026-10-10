import type { Metadata } from "next";
import Link from "next/link";
import { TrainingCard } from "@/components/training-card";
import { describeTrainingCount, normalizeCatalogQuery } from "@/lib/catalog";
import { getCategories, getTrainings } from "@/lib/public-catalog";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const metadata: Metadata = buildPageMetadata({
  title: "Katalog szkoleń",
  description: "Znajdź demonstracyjne szkolenie dla siebie lub zespołu.",
  path: "/szkolenia",
});

export default async function TrainingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeCatalogQuery(await searchParams);
  const [categories, trainings] = await Promise.all([
    getCategories(),
    getTrainings(filters),
  ]);
  return (
    <main>
      <section className="page-hero">
        <div className="page-shell">
          <p className="eyebrow">Katalog szkoleń</p>
          <h1>Znajdź szkolenie dla siebie lub zespołu</h1>
          <p className="lead">
            Filtruj po obszarze albo wpisz temat. Wybrane parametry pozostają w
            adresie strony.
          </p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="page-shell">
          <form className="catalog-form" action="/szkolenia" method="get">
            <label>
              <span>Wyszukaj</span>
              <input
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="np. sztuczna inteligencja"
              />
            </label>
            <label>
              <span>Obszar</span>
              <select name="category" defaultValue={filters.category}>
                <option value="">Wszystkie obszary</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" type="submit">
              Pokaż wyniki
            </button>
            {(filters.q || filters.category) && (
              <Link className="clear-link" href="/szkolenia">
                Wyczyść
              </Link>
            )}
          </form>
          <p className="results-count" aria-live="polite">
            {describeTrainingCount(trainings.length)}
          </p>
          {trainings.length ? (
            <div className="training-grid">
              {trainings.map((training) => (
                <TrainingCard key={training.id} training={training} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Brak wyników</h2>
              <p>Zmień frazę lub wybierz inny obszar.</p>
              <Link href="/szkolenia">Wyczyść filtry</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
