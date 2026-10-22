import type { Metadata } from "next";

import { TrainerAvatar } from "@/components/trainer-avatar";
import { Badge, ButtonLink, Card, Icon, PageHeader } from "@/components/ui";
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
    <main className="ui-section ui-section-head">
      <div className="ui-container">
        <PageHeader
          eyebrow="Nasi trenerzy"
          lead="[DEMO] Praktyczne doświadczenie, jasno przekazana wiedza i skupienie na rezultacie."
          title="Ekspertki i eksperci, którzy Cię poprowadzą"
        />

        {/* ISK-373 / P18: stan pusty. Seed `[DEMO]` zawsze tworzy dwoje
            trenerow, wiec na srodowisku demonstracyjnym nie da sie tego
            zobaczyc — ale lista moze byc pusta po wycofaniu profili
            z publikacji, a wtedy zostawala gola sekcja bez slowa wyjasnienia. */}
        {trainers.length === 0 ? (
          <Card className="empty-state" padding="roomy">
            <h2 className="empty-state-title">
              Lista trenerów jest w przygotowaniu
            </h2>
            <p>
              Nie mamy teraz opublikowanego żadnego profilu. Napisz do nas —
              dobierzemy prowadzącego do tematu szkolenia.
            </p>
            <ButtonLink href="/kontakt" size="sm" variant="primary">
              Zapytaj o szkolenie
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
          </Card>
        ) : (
          <ul className="trainer-grid">
            {trainers.map((trainer) => (
              /*
                KARTA NIE JEST LINKIEM — ODSTEPSTWO ZGODNE Z D4.
                Wzorzec renderuje cala karte jako `button` otwierajacy CV
                trenera. ISK-399 / D4 stawia `/trenerzy/[slug]` POZA V1
                (model danych nie ma kolumn na przebieg zawodowy ani
                wyksztalcenie, a migracje sa zabronione), wiec nie ma dokad
                linkowac. Karta zostaje `article` — lepsze niz link prowadzacy
                do 404 i lepsze niz `button`, ktory nic nie robi.
              */
              <li key={trainer.id}>
                <Card className="trainer-card" padding="roomy">
                  <div className="trainer-identity">
                    <TrainerAvatar
                      fullName={trainer.full_name}
                      photoUrl={trainer.photo_url}
                      size={64}
                    />
                    <div className="trainer-identity-text">
                      <h2 className="trainer-name">{trainer.full_name}</h2>
                      {trainer.headline ? (
                        <p className="trainer-role">{trainer.headline}</p>
                      ) : null}
                    </div>
                  </div>

                  {trainer.competences.length > 0 ? (
                    <ul className="trainer-chips">
                      {trainer.competences.map((competence) => (
                        <li key={competence}>
                          <Badge tone="soft">{competence}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {trainer.bio ? (
                    <p className="trainer-bio">{trainer.bio}</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
