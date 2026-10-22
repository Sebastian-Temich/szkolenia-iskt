import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrainerAvatar } from "@/components/trainer-avatar";
import {
  Badge,
  ButtonLink,
  Card,
  Icon,
  IconChip,
  SubsectionTitle,
} from "@/components/ui";
import {
  formatDurationHours,
  formatLevel,
  formatPriceNet,
  formatProgramIndex,
} from "@/lib/format";
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
  const duration = formatDurationHours(training.duration_hours);
  const price = formatPriceNet(training.price_net_pln);
  // Slownik `level` jest ASCII w bazie (check + enum), etykieta ma diakrytyki.
  const level = formatLevel(training.level);
  const contactHref = `/kontakt?szkolenie=${encodeURIComponent(training.slug)}`;

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* --------------------------------------------------- pasmo `muted` -- */}
      <section className="detail-hero">
        <div className="ui-container">
          <nav aria-label="Ścieżka nawigacji" className="detail-crumbs">
            <Link className="back-link" href="/szkolenia">
              <Icon name="arrow-left" size={16} />
              Katalog
            </Link>
            {training.category ? (
              <>
                <span aria-hidden="true" className="detail-crumb-sep">
                  /
                </span>
                <span className="detail-crumb">{training.category.name}</span>
              </>
            ) : null}
          </nav>

          <div className="detail-badges">
            {training.category ? (
              <Badge tone="solid">{training.category.name}</Badge>
            ) : null}
            {/* Wzorzec ma tu badge "Bestseller/Nowosc/Popularne" oraz
                "Dofinansowanie do 80%". ISK-399 / D1: progu procentowego nie
                umieszczamy, a oceny nie ma w modelu danych. Zostaje sam fakt
                z `funding_available`. */}
            {training.funding_available ? (
              <Badge tone="soft">
                <Icon name="banknote" size={16} />
                Dofinansowanie
              </Badge>
            ) : null}
          </div>

          <h1 className="detail-title">{training.title}</h1>
          <p className="detail-lead">{training.summary}</p>

          {/* Trzy metryki. Kolumna `duration_hours` jest liczba godzin, a nie
              tekstem jak we wzorcu ("2 dni · 16h"), wiec liczby dni nie ma
              w danych i jej nie zgadujemy. Formatu zajec (online /
              stacjonarnie) model nie ma w ogole — pozycja jest pominieta
              i zapisana jako odstepstwo, zamiast wpisana na sztywno. */}
          <dl className="detail-facts">
            {duration ? (
              <div className="detail-fact">
                <dt className="detail-fact-label">
                  <Icon name="clock" size={15} />
                  Czas trwania
                </dt>
                <dd className="detail-fact-value">{duration}</dd>
              </div>
            ) : null}
            {level ? (
              <div className="detail-fact">
                <dt className="detail-fact-label">
                  <Icon name="gauge" size={15} />
                  Poziom
                </dt>
                <dd className="detail-fact-value">{level}</dd>
              </div>
            ) : null}
            {price ? (
              <div className="detail-fact">
                <dt className="detail-fact-label">
                  <Icon name="banknote" size={15} />
                  Cena netto
                </dt>
                <dd className="detail-fact-value">{price}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------- pasmo biale --- */}
      <section className="ui-section detail-body">
        <div className="detail-grid ui-container">
          <div className="detail-main">
            {training.description ? (
              <section className="detail-block">
                <SubsectionTitle>O szkoleniu</SubsectionTitle>
                <p className="detail-prose">{training.description}</p>
              </section>
            ) : null}

            {/* Stany puste (ISK-374 / BL-C): panel nie wypelnia wszystkich pol
                tresci, a kolumny maja wartosci domyslne `null` / `'{}'`. Bez
                tych warunkow szkolenie dodane w panelu pokazywalo naglowek nad
                pusta lista. */}
            {training.learning_outcomes.length > 0 ? (
              <section className="detail-block">
                <SubsectionTitle>Czego się nauczysz</SubsectionTitle>
                <ul className="detail-outcomes">
                  {training.learning_outcomes.map((item) => (
                    <li className="detail-outcome" key={item}>
                      <span aria-hidden="true" className="detail-check">
                        <Icon name="check" size={14} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {training.program.length > 0 ? (
              <section className="detail-block">
                <SubsectionTitle>Program szkolenia</SubsectionTitle>
                <ol className="detail-program">
                  {training.program.map((part, index) => (
                    <li className="detail-module" key={part.title}>
                      {/* Numeracja nie jest w danych — liczymy ja z pozycji,
                          tak jak wzorzec (`'Jeden modul w linii — numeracja
                          doda sie automatycznie'` w jego panelu). */}
                      <span aria-hidden="true" className="detail-module-number">
                        {formatProgramIndex(index)}
                      </span>
                      <div className="detail-module-body">
                        <h3 className="detail-module-title">{part.title}</h3>
                        {part.items.length > 0 ? (
                          <ul className="detail-module-items">
                            {part.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {training.target_audience ? (
              <section className="detail-callout">
                <SubsectionTitle>Dla kogo jest to szkolenie</SubsectionTitle>
                <p className="detail-prose">{training.target_audience}</p>
              </section>
            ) : null}
          </div>

          {/*
            PANEL ZAPISU JEST PRZYKLEJONY I NAPRAWDE DZIALA.
            We wzorcu panel ma `position: sticky; top: 88px`, ale jest dzieckiem
            siatki PASMA HERO, a element przyklejony nie wychodzi poza swoj blok
            zawierajacy — wiec przestaje sie trzymac, gdy tylko hero zjedzie
            z ekranu, czyli w calym pasmie tresci, gdzie jest potrzebny. To nie
            jest cecha, to wada i nie odtwarzamy jej.
            Naprawa: panel stoi w prawej kolumnie PASMA TRESCI, a przyklejona
            jest cala kolumna — dokladnie tak, jak wzorzec robi to poprawnie na
            swojej stronie trenera. `top: 88px` = 68 px naglowka + 20 px luzu.
            Ponizej 64 rem siatka ma jedna kolumne i `position: static`.
          */}
          <aside className="detail-aside">
            <Card className="detail-enroll" padding="roomy">
              {price ? (
                <div className="detail-price">
                  <span className="detail-price-label">Cena szkolenia</span>
                  <strong className="detail-price-value">{price}</strong>
                  <span className="detail-price-note">netto za osobę</span>
                </div>
              ) : (
                <div className="detail-price">
                  <span className="detail-price-label">Cena szkolenia</span>
                  <strong className="detail-price-value">
                    Wycena indywidualna
                  </strong>
                </div>
              )}

              <ButtonLink block href={contactHref} size="lg" variant="primary">
                Skontaktuj się w sprawie zapisu
                <Icon name="arrow-right" size={18} />
              </ButtonLink>

              <div className="detail-terms">
                <p className="detail-terms-title">Terminy</p>
                <p className="detail-terms-text">
                  <Icon name="calendar" size={16} />
                  {training.terms_note ?? "Terminy ustalane indywidualnie."}
                </p>
              </div>
            </Card>

            {training.trainers.length > 0 ? (
              <Card className="detail-leads">
                <p className="detail-aside-title">Prowadzący</p>
                <ul className="detail-leads-list">
                  {training.trainers.map((trainer) => (
                    /* ISK-399 / D4: trasa `/trenerzy/[slug]` jest POZA V1, wiec
                       wiersz nie jest linkiem. Wzorzec linkuje do CV trenera —
                       zapisane jako jawne odstepstwo. */
                    <li className="detail-lead" key={trainer.id}>
                      <TrainerAvatar
                        fullName={trainer.full_name}
                        photoUrl={trainer.photo_url}
                        size={52}
                      />
                      <span className="detail-lead-text">
                        <span className="detail-lead-name">
                          {trainer.full_name}
                        </span>
                        {trainer.headline ? (
                          <span className="detail-lead-role">
                            {trainer.headline}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {/* Karta dofinansowania jest WARUNKOWA i bierze tresc z bazy.
                Wzorzec renderuje ja zawsze i wpisuje na sztywno zdanie
                o KFS i BUR, niezaleznie od `fundable` — ISK-399 / D1 zabrania
                bezwarunkowego zdania o KFS/BUR. */}
            {training.funding_available ? (
              <Card className="detail-funding" tone="dark">
                <p className="detail-funding-title">
                  <IconChip icon="banknote" size="xs" tone="on-dark" />
                  Dofinansowanie
                </p>
                <p className="detail-funding-text">
                  {training.funding_note ??
                    "To szkolenie może kwalifikować się do dofinansowania. Napisz do nas — sprawdzimy dostępne możliwości."}
                </p>
                <ButtonLink block href={contactHref} size="sm" variant="light">
                  Zapytaj o dofinansowanie
                  <Icon name="arrow-right" size={18} />
                </ButtonLink>
              </Card>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}
