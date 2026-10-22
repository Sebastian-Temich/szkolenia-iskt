import { NotFoundScreen } from "@/components/not-found-screen";
import { ButtonLink, Icon } from "@/components/ui";

/**
 * 404 szczegolu szkolenia. Trasa nalezy do grupy `(public)`, wiec naglowek
 * i stopke daje `app/(public)/layout.tsx` — nawigacja jest tu pelna
 * i wystarcza, zostaje wiec jedno jawne wyjscie do katalogu.
 *
 * ISK-412 / UX-Z1: uklad przeniesiony do `NotFoundScreen`, wspolnego
 * z globalnym `app/not-found.tsx`. Oba ekrany mialy wczesniej `h1` o rozmiarze
 * 21,6 px zamiast 48 px i rozna powloke; teraz roznia sie WYLACZNIE trescia.
 *
 * H1 MUSI zawierac „Nie znaleźliśmy”: `public-pages.spec.ts` sprawdza ten tekst
 * razem ze statusem 404, czyli dowodzi, ze nieopublikowane szkolenie nie tylko
 * wyglada na nieobecne, ale faktycznie oddaje 404 (ochrona szkicow).
 */
export default function NotFound() {
  return (
    <NotFoundScreen
      actions={
        <ButtonLink href="/szkolenia" size="sm" variant="primary">
          Wróć do katalogu
          <Icon name="arrow-right" size={18} />
        </ButtonLink>
      }
      title="Nie znaleźliśmy tego szkolenia"
    >
      Szkolenie nie istnieje albo nie zostało opublikowane.
    </NotFoundScreen>
  );
}
