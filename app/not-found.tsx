import { ButtonLink, Card, Eyebrow, Icon } from "@/components/ui";

export const metadata = {
  title: "Nie znaleźliśmy tej strony — Szkolenia ISKT",
};

/**
 * Globalny 404. Do ISK-401 ten plik NIE istnial — jedyny `not-found` lezal pod
 * `app/(public)/szkolenia/[slug]/`, wiec kazdy inny nieistniejacy adres
 * (`/kontakt/cokolwiek`, `/panel/nieistniejace`, literowka w linku z zewnatrz)
 * dostawal wbudowany ekran Next.js: angielski, bez stylu i bez drogi powrotnej.
 *
 * DLACZEGO BEZ `SiteHeader` I `SiteFooter`
 * Trzy powody, w tej kolejnosci wagi:
 *
 *  1. `SiteFooter` jest komponentem ASYNCHRONICZNYM i odpytuje baze
 *     (`getCategories()` dla kolumny obszarow). Odpowiedz 404 ma byc najtansza
 *     i najpewniejsza odpowiedzia serwisu; podpiecie jej pod zapytanie do bazy
 *     oznacza, ze awaria bazy zamienia 404 na 500, czyli najprostszy przypadek
 *     psuje sie razem z najtrudniejszym.
 *  2. Ten widok renderuje sie dla CALEJ aplikacji, w tym dla adresow panelu.
 *     Publiczna nawigacja marketingowa nad adresem `/panel/...` nie jest
 *     informacja, tylko podpowiedzia w zla strone — a panel ma wlasna powloke
 *     (`app/panel/(admin)/layout.tsx`), ktorej ten plik nie zna.
 *  3. Bez naglowka widok musi sam dac wyjscie — i daje dwa jawne, wiec nie ma
 *     zaulka: strona glowna oraz katalog szkolen.
 *
 * `app/(public)/szkolenia/[slug]/not-found.tsx` zostaje osobno: tamten 404 ma
 * konkretna przyczyne („szkolenie nie istnieje albo nie zostalo opublikowane”)
 * i lezy w grupie `(public)`, wiec dostaje pelna nawigacje.
 */
export default function NotFound() {
  return (
    <main className="ui-section">
      <div className="ui-container">
        <Card className="empty-state" padding="roomy">
          <Eyebrow dash={false}>404</Eyebrow>
          <h1 className="empty-state-title">Nie znaleźliśmy tej strony</h1>
          <p>
            Adres może być nieaktualny albo zawierać literówkę. Poniżej są dwa
            miejsca, z których da się ruszyć dalej.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/" size="sm" variant="primary">
              Strona główna
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
            <ButtonLink href="/szkolenia" size="sm" variant="neutral">
              Katalog szkoleń
            </ButtonLink>
          </div>
        </Card>
      </div>
    </main>
  );
}
