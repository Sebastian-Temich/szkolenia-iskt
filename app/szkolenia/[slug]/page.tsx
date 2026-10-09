import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTraining } from "@/lib/public-catalog";
import { buildPageMetadata, buildTrainingJsonLd } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const training = await getTraining(slug);
  if (!training)
    return {
      title: "Nie znaleziono szkolenia | ISKT",
      robots: { index: false, follow: false },
    };
  return buildPageMetadata({
    title: training.seo_title ?? training.title,
    description: training.seo_description ?? training.summary,
    path: `/szkolenia/${training.slug}`,
  });
}

export default async function TrainingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const training = await getTraining(slug);
  if (!training) notFound();
  const jsonLd = buildTrainingJsonLd(training);
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="page-hero detail-hero">
        <div className="page-shell">
          <Link className="back-link" href="/szkolenia">
            ← Wróć do katalogu
          </Link>
          <p className="eyebrow">{training.category?.name}</p>
          <h1>{training.title}</h1>
          <p className="lead">{training.summary}</p>
          <div className="facts">
            {training.level && (
              <span>
                Poziom: <strong>{training.level}</strong>
              </span>
            )}
            {training.duration_hours && (
              <span>
                Czas: <strong>{training.duration_hours} godz.</strong>
              </span>
            )}
            {training.funding_available && (
              <span>
                <strong>Dofinansowanie [DEMO]</strong>
              </span>
            )}
          </div>
        </div>
      </section>
      <section className="section section-tight">
        <div className="detail-grid page-shell">
          <article className="prose">
            <h2>O szkoleniu</h2>
            <p>{training.description}</p>
            <h2>Czego się nauczysz</h2>
            <ul>
              {training.learning_outcomes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h2>Program szkolenia</h2>
            {training.program.map((section) => (
              <div key={section.title} className="program">
                <h3>{section.title}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            {training.target_audience && (
              <>
                <h2>Dla kogo</h2>
                <p>{training.target_audience}</p>
              </>
            )}
          </article>
          <aside className="detail-aside">
            <h2>Zapytaj o szkolenie</h2>
            <p>{training.terms_note ?? "Terminy ustalane indywidualnie."}</p>
            <Link
              className="button"
              href={`/kontakt?szkolenie=${training.slug}`}
            >
              Skontaktuj się →
            </Link>
            {training.trainers.length > 0 && (
              <div className="trainer-mini">
                <p className="eyebrow">Prowadzący</p>
                {training.trainers.map((trainer) => (
                  <strong key={trainer.id}>{trainer.full_name}</strong>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
