import { NotFoundScreen } from "@/components/not-found-screen";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink, Icon } from "@/components/ui";

export const metadata = {
  title: "Nie znaleźliśmy tej strony — Szkolenia ISKT",
};

/**
 * Globalny 404. Do ISK-401 ten plik NIE istnial — jedyny `not-found` lezal pod
 * `app/(public)/szkolenia/[slug]/`, wiec kazdy inny nieistniejacy adres
 * (`/kontakt/cokolwiek`, `/panel/nieistniejace`, literowka w linku z zewnatrz)
 * dostawal wbudowany ekran Next.js: angielski, bez stylu i bez drogi powrotnej.
 *
 * ISK-412 / UX-Z1 — NAGLOWEK I STOPKA SA TU TERAZ, WCZESNIEJ ICH NIE BYLO
 * Bramka UX zglosila, ze dwa ekrany 404 zachowuja sie inaczej: ten renderowal
 * sie bez powloki, a 404 szczegolu szkolenia z pelna nawigacja. Poprzednia
 * wersja uzasadniala to trzema powodami; bramka je rozpatrzyla i kazala
 * ujednolicic. Dwa z nich zostaly ZAADRESOWANE, a nie zignorowane:
 *
 *  1. „`SiteFooter` odpytuje baze, wiec awaria bazy zamieni 404 na 500”.
 *     To byl realny argument i dlatego `SiteFooter` NIE przewraca sie juz na
 *     bledzie zapytania — lapie go i renderuje stopke bez kolumny obszarow
 *     (patrz `components/site-footer.tsx`). Przyczyna jest usunieta u zrodla,
 *     a nie obchodzona brakiem stopki.
 *  2. „Ten widok renderuje sie takze dla adresow panelu”. ZAWEZONE w ISK-426
 *     / D-2: trasy szczegolu panelu maja juz wlasna granice
 *     `app/panel/(admin)/not-found.tsx`, wiec administrator z literowka w ID
 *     zostaje w powloce panelu i dostaje wyjscia na jego listy. Ten plik
 *     obsluguje teraz wylacznie adresy NIEDOPASOWANE — w tym `/panel/cokolwiek`
 *     — i tak ma byc: takie zadanie nie przechodzi przez `requireAdmin()`,
 *     wiec powloka panelu nie moze sie dla niego wyrenderowac. 404 jest tu
 *     odpowiedzia publiczna, a osoba z calkiem zlym adresem potrzebuje
 *     wyjscia na strone, nie nawigacji panelu.
 *
 * Dwa wyjscia zostaja — strona glowna i katalog.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <NotFoundScreen
        actions={
          <>
            <ButtonLink href="/" size="sm" variant="primary">
              Strona główna
              <Icon name="arrow-right" size={18} />
            </ButtonLink>
            <ButtonLink href="/szkolenia" size="sm" variant="neutral">
              Katalog szkoleń
            </ButtonLink>
          </>
        }
        title="Nie znaleźliśmy tej strony"
      >
        Adres może być nieaktualny albo zawierać literówkę. Poniżej są dwa
        miejsca, z których da się ruszyć dalej.
      </NotFoundScreen>
      <SiteFooter />
    </>
  );
}
