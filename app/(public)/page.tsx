import Link from "next/link";
import { TrainingCard } from "@/components/training-card";
import { getCategories, getTrainings } from "@/lib/public-catalog";

export const revalidate = 300;

export default async function Home() {
  const [categories, trainings] = await Promise.all([
    getCategories(),
    getTrainings(),
  ]);
  const featured = trainings
    .filter((training) => training.is_featured)
    .slice(0, 3);

  return (
    <main>
      <section className="hero">
        <div className="hero-grid page-shell">
          <div>
            <p className="eyebrow">— Szkolenia dla biznesu i specjalistów</p>
            <h1>Kompetencje, które zmieniają wiedzę w działanie.</h1>
            <p className="lead">
              [DEMO] Praktyczne programy prowadzone przez ekspertów. Wybierz
              temat, który pomoże Tobie i Twojemu zespołowi zrobić kolejny krok.
            </p>
            <div className="button-row">
              <Link className="button" href="/szkolenia">
                Zobacz szkolenia →
              </Link>
              <Link className="button button-ghost" href="/kontakt">
                Porozmawiajmy
              </Link>
            </div>
          </div>
          <div className="hero-panel" aria-label="Najważniejsze informacje">
            <span className="hero-orbit">ISKT</span>
            <p>Wiedza</p>
            <strong>Praktyka</strong>
            <p>Rozwój</p>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="page-shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Obszary rozwoju</p>
              <h2>Znajdź właściwy kierunek</h2>
            </div>
            <Link href="/szkolenia">Pełny katalog →</Link>
          </div>
          <div className="category-grid">
            {categories.map((category, index) => (
              <Link
                className="category-card"
                href={`/szkolenia?category=${category.slug}`}
                key={category.id}
              >
                <span>0{index + 1}</span>
                <h3>{category.name}</h3>
                <p>{category.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-tint">
        <div className="page-shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Najczęściej wybierane</p>
              <h2>Szkolenia, od których warto zacząć</h2>
            </div>
          </div>
          <div className="training-grid">
            {featured.map((training) => (
              <TrainingCard key={training.id} training={training} />
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="cta page-shell">
          <div>
            <p className="eyebrow eyebrow-light">Dobierzmy program</p>
            <h2>Nie wiesz, które szkolenie wybrać?</h2>
            <p>
              Opowiedz nam o potrzebach zespołu. To miejsce przygotowane pod
              formularz E4.
            </p>
          </div>
          <Link className="button button-light" href="/kontakt">
            Przejdź do kontaktu →
          </Link>
        </div>
      </section>
    </main>
  );
}
