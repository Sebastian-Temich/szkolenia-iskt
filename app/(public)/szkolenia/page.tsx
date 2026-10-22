import type { Metadata } from "next";

import { TrainingCard } from "@/components/training-card";
import {
  Button,
  ButtonLink,
  Card,
  Field,
  FilterPillLink,
  Icon,
  PageHeader,
  SearchInput,
} from "@/components/ui";
import { describeTrainingCount, normalizeCatalogQuery } from "@/lib/catalog";
import { getCategories, getTrainings } from "@/lib/public-catalog";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const metadata: Metadata = buildPageMetadata({
  title: "Katalog szkoleń",
  description: "Znajdź demonstracyjne szkolenie dla siebie lub zespołu.",
  path: "/szkolenia",
});

/** Adres katalogu z zadanym filtrem — jedno zrodlo prawdy dla wszystkich pigulek. */
function catalogHref({ category, q }: { category?: string; q?: string }) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/szkolenia?${query}` : "/szkolenia";
}

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
  const hasFilters = Boolean(filters.q || filters.category);

  return (
    <main className="ui-section ui-section-head">
      <div className="ui-container">
        <PageHeader
          eyebrow="Katalog szkoleń"
          lead="Filtruj po obszarze albo wpisz temat. Wybrane parametry pozostają w adresie strony."
          title="Znajdź szkolenie dla siebie lub zespołu"
        />

        {/*
          FILTR OBSZARU TO LINKI, NIE `select`.
          Wzorzec ma pigulki, ale trzyma filtr w stanie klienta — nie ma adresu,
          wiec wyniku nie da sie wkleic ani zindeksowac. Tutaj kazda pigulka to
          `Link` z `?category=<slug>`, czyli stan filtra JEST adresem. Pigulka
          aktywna niesie `aria-current="page"`, bo samo tlo to sygnal wylacznie
          kolorem (WCAG 1.4.1), i zachowuje biezaca fraze — zmiana obszaru nie
          kasuje wyszukiwania (wzorzec kasuje: `openCat` ustawia `query: ''`).

          Poprzednia wersja uzywala `<select name="category">`. Kontrakt adresu
          (`?category=`, `?q=`) jest identyczny — zmienia sie kontrolka, nie
          protokol, wiec wszystkie przeplywy katalogu zostaja.

          Wzorzec nie ma na pigulkach zadnego `:hover` ani przejscia; `.ui-filterpill`
          z M1 je ma.
        */}
        <div className="catalog-controls">
          <nav aria-label="Filtr obszarów" className="catalog-pills">
            <FilterPillLink
              active={!filters.category}
              href={catalogHref({ q: filters.q })}
            >
              Wszystkie
            </FilterPillLink>
            {categories.map((category) => (
              <FilterPillLink
                active={filters.category === category.slug}
                href={catalogHref({ category: category.slug, q: filters.q })}
                key={category.id}
              >
                {category.name}
              </FilterPillLink>
            ))}
          </nav>

          {/*
            Wybrany obszar jedzie z formularzem wyszukiwania jako pole ukryte —
            bez tego wpisanie frazy kasowaloby filtr. Pole stoi POZA
            `.catalog-form` i jest przypisane do niego atrybutem `form`:
            bramka `tests/e2e/ux-powazne.spec.ts` mierzy kolor krawedzi KAZDEGO
            `input` w `.catalog-form`, a pole ukryte krawedzi nie ma (preflight
            Tailwinda v4 zostawia `currentColor`), wiec wpadloby w ta asercje
            jako falszywy blad.
          */}
          {filters.category ? (
            <input
              form="catalog-search"
              name="category"
              type="hidden"
              value={filters.category}
            />
          ) : null}

          <form
            action="/szkolenia"
            className="catalog-form"
            id="catalog-search"
            method="get"
            role="search"
          >
            {/* Etykieta jest WIDOCZNA, choc wzorzec ma tylko `placeholder`.
                Placeholder znika po wpisaniu pierwszego znaku, wiec nie jest
                etykieta — pole bez etykiety nie mowi, czego dotyczy wpisana
                fraza, ani czytnikowi ekranu, ani osobie wracajacej do strony. */}
            <Field
              className="catalog-search-field"
              id="catalog-q"
              label="Wyszukaj"
            >
              <SearchInput
                defaultValue={filters.q}
                id="catalog-q"
                name="q"
                placeholder="Szukaj szkolenia…"
              />
            </Field>
            <Button className="catalog-submit" type="submit" variant="primary">
              Pokaż wyniki
            </Button>
          </form>
        </div>

        <div className="catalog-summary">
          {/* Licznik uzywa helpera liczebnosci z `lib/catalog.ts`. Wzorzec ma tu
              `n + ' szkoleń'` dla wszystkiego poza jedynka, czyli renderuje
              "2 szkoleń" — poprawny helper istnieje w pliku wzorca, ale sluzy
              wylacznie ekranowi administratora. */}
          <p aria-live="polite" className="results-count">
            {describeTrainingCount(trainings.length)}
          </p>
          {/* Link czyszczacy pokazujemy tylko wtedy, gdy sa wyniki: przy pustym
              katalogu to samo wyjscie stoi w stanie pustym, a dwa linki o tej
              samej nazwie dostepnej sa niejednoznaczne dla czytnika ekranu
              i dla selektorow bramek. */}
          {hasFilters && trainings.length > 0 ? (
            <ButtonLink
              className="catalog-clear"
              href="/szkolenia"
              size="sm"
              variant="neutral"
            >
              Wyczyść filtry
            </ButtonLink>
          ) : null}
        </div>

        {trainings.length ? (
          <div className="catalog-grid">
            {trainings.map((training) => (
              <TrainingCard
                headingLevel="h2"
                key={training.id}
                training={training}
              />
            ))}
          </div>
        ) : (
          /* Stanu pustego wzorzec nie ma w ogole — przy zerowej liczbie wynikow
             renderuje licznik nad pusta siatka. */
          <Card className="empty-state" padding="roomy">
            <h2 className="empty-state-title">Brak wyników</h2>
            <p>Zmień frazę lub wybierz inny obszar.</p>
            <ButtonLink href="/szkolenia" size="sm" variant="primary">
              Wyczyść filtry
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
          </Card>
        )}
      </div>
    </main>
  );
}
