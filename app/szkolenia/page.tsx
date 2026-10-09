import Link from "next/link";

import { getPublishedTrainings } from "@/lib/catalog/public";
import { toOne } from "@/lib/supabase/embed";

export const revalidate = 3600;

export default async function PublicTrainingsPage() {
  const trainings = await getPublishedTrainings();
  return (
    <main className="public-catalog">
      <p className="panel-eyebrow">Oferta ISKT</p>
      <h1>Szkolenia</h1>
      {trainings.length ? (
        <div className="panel-grid">
          {trainings.map((training) => (
            <article className="panel-card" key={training.id}>
              <p className="panel-eyebrow">
                {toOne(training.categories)?.name}
              </p>
              <h2>{training.title}</h2>
              <p>{training.summary}</p>
              <Link href={`/szkolenia/${training.slug}`}>Poznaj program</Link>
            </article>
          ))}
        </div>
      ) : (
        <p>Aktualnie przygotowujemy ofertę szkoleń.</p>
      )}
    </main>
  );
}
