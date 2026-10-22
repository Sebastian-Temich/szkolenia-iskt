import { ButtonLink, Card, Eyebrow, Icon } from "@/components/ui";

/**
 * 404 szczegolu szkolenia. Trasa nalezy do grupy `(public)`, wiec ten widok
 * dostaje naglowek i stopke z `app/(public)/layout.tsx` — nawigacja jest tu
 * pelna i wystarcza; zostaje wiec jedno jawne wyjscie do katalogu.
 *
 * H1 MUSI zawierac „Nie znaleźliśmy”: `public-pages.spec.ts` sprawdza ten tekst
 * razem ze statusem 404, czyli dowodzi, ze nieopublikowane szkolenie nie tylko
 * wyglada na nieobecne, ale faktycznie oddaje 404 (ochrona szkicow).
 */
export default function NotFound() {
  return (
    <main className="ui-section">
      <div className="ui-container">
        <Card className="empty-state" padding="roomy">
          <Eyebrow dash={false}>404</Eyebrow>
          <h1 className="empty-state-title">Nie znaleźliśmy tego szkolenia</h1>
          <p>Szkolenie nie istnieje albo nie zostało opublikowane.</p>
          <ButtonLink href="/szkolenia" size="sm" variant="primary">
            Wróć do katalogu
            <Icon name="arrow-right" size={18} />
          </ButtonLink>
        </Card>
      </div>
    </main>
  );
}
