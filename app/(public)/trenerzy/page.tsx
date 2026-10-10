import type { Metadata } from "next";
import Image from "next/image";
import { getTrainers } from "@/lib/public-catalog";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const metadata: Metadata = buildPageMetadata({
  title: "Trenerzy",
  description:
    "Poznaj demonstracyjny zespół ekspertów prowadzących szkolenia ISKT.",
  path: "/trenerzy",
});

function Initials({ name }: { name: string }) {
  return (
    <span aria-hidden="true">
      {name
        .replace("[DEMO]", "")
        .trim()
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}

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
        <div className="trainer-grid page-shell">
          {trainers.map((trainer) => (
            <article className="trainer-card" key={trainer.id}>
              {trainer.photo_url ? (
                <Image
                  src={trainer.photo_url}
                  alt=""
                  width={144}
                  height={144}
                  unoptimized
                />
              ) : (
                <div className="avatar">
                  <Initials name={trainer.full_name} />
                </div>
              )}
              <div>
                <p className="eyebrow">{trainer.competences.join(" · ")}</p>
                <h2>{trainer.full_name}</h2>
                <strong>{trainer.headline}</strong>
                <p>{trainer.bio}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
