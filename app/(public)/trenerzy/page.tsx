import type { Metadata } from "next";
import Link from "next/link";
import { TrainerAvatar } from "@/components/trainer-avatar";
import { getTrainers } from "@/lib/public-catalog";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const metadata: Metadata = buildPageMetadata({
  title: "Trenerzy",
  description:
    "Poznaj demonstracyjny zespół ekspertów prowadzących szkolenia ISKT.",
  path: "/trenerzy",
});

export default async function TrainersPage() {
  const trainers = await getTrainers();
  return (
    <main>
      <section className="page-hero">
        <div className="page-shell">
          <p className="eyebrow">Nasi trenerzy</p>
          <h1>Ekspertki i eksperci, którzy Cię poprowadzą</h1>
          <p className="lead">
            [DEMO] Praktyczne doświadczenie, jasno przekazana wiedza i skupienie
            na rezultacie.
          </p>
        </div>
      </section>
      <section className="section section-tight">
        {/* ISK-373 / P18: stan pusty. Seed `[DEMO]` zawsze tworzy dwoje trenerow,
            wiec na zadnym srodowisku demonstracyjnym nie da sie tego zobaczyc —
            ale lista moze byc pusta po wycofaniu profili z publikacji, a wtedy
            zostawala goła sekcja bez jednego slowa wyjasnienia. */}
        {trainers.length === 0 ? (
          <div className="page-shell">
            <div className="empty-state">
              <h2>Lista trenerów jest w przygotowaniu</h2>
              <p>
                Nie mamy teraz opublikowanego żadnego profilu. Napisz do nas —
                dobierzemy prowadzącego do tematu szkolenia.
              </p>
              <Link className="button" href="/kontakt">
                Zapytaj o szkolenie →
              </Link>
            </div>
          </div>
        ) : (
          <div className="trainer-grid page-shell">
            {trainers.map((trainer) => (
              <article className="trainer-card" key={trainer.id}>
                <TrainerAvatar
                  photoUrl={trainer.photo_url}
                  fullName={trainer.full_name}
                />
                <div>
                  <p className="eyebrow">{trainer.competences.join(" · ")}</p>
                  <h2>{trainer.full_name}</h2>
                  <strong>{trainer.headline}</strong>
                  <p>{trainer.bio}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
