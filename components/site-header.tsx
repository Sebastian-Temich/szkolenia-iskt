"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";

import { ButtonLink, Icon, IconButton } from "@/components/ui";

/**
 * Pasek nawigacji wzorca: sticky, wysokosc 68 px, tlo `rgba(255,255,255,.82)`
 * z `backdrop-filter: blur(12px)` i krawedzia dolna `--border-subtle`.
 *
 * NAWIGACJA MOBILNA JEST PROJEKTOWANA, NIE ODTWARZANA
 * Wzorzec nie ma ani jednej reguly `@media` i nie ma nawigacji mobilnej — piec
 * linkow i CTA stoja w jednym rzedzie bez wzgledu na szerokosc, wiec przy
 * 360 px wychodza poza ekran. Ponizej 60 rem linki chowaja sie za przyciskiem
 * rozwijajacym. CTA zostaje widoczne na KAZDEJ szerokosci — bramka UX mierzy to
 * wprost (`tests/e2e/ux-blockers.spec.ts`: `display !== "none"` przy 360 px),
 * bo ukrycie glownej sciezki konwersji na telefonie bylo juz raz defektem.
 *
 * DLACZEGO KOMPONENT KLIENCKI
 * Panel rozwijany ma stan, a po nawigacji musi sam sie zamknac — nawigacja
 * klientem nie przemontowuje naglowka, wiec bez tego menu zostawaloby otwarte
 * nad nowa trescia. Render jest identyczny po obu stronach, wiec HTML pierwszej
 * odpowiedzi zawiera pelna nawigacje i SEO nic nie traci.
 *
 * DLACZEGO `chevron-down`, A NIE HAMBURGER
 * Zestaw ikon bundlowanych w ISK-400 nie ma `menu` ani `x`, a granica ISK-399
 * zabrania dociagania ikon z CDN. `chevron-down` obrocony o 180 stopni czyta
 * sie jako ujawnianie tresci i jest dokladnie tym, czym ta kontrolka jest.
 *
 * NAZWA DOSTEPNA PRZELACZNIKA IDZIE PRZEZ `IconButton` (ISK-411 / CR-B2, I12)
 * Do ISK-411 nazwa stala na tekscie w `<span className="ui-visually-hidden">`.
 * Dzialalo, ale bylo zawieszone na JEDNEJ regule arkusza: zamiana
 * `.ui-visually-hidden` na `display: none` (albo podmiana tego spana na
 * `title`) zdejmowala przyciskowi nazwe dostepna i dawala naruszenie
 * `button-name` o wadze `critical` — a jedyny komponent serwisu istniejacy
 * WYLACZNIE ponizej 60 rem nie mial wtedy ani jednego testu, bo oba projekty
 * Playwrighta chodza na 1280 px, gdzie ta kontrolka jest `display: none`.
 *
 * `IconButton` wymaga `label` w typie i oddaje go jako `aria-label`, wiec
 * nazwa nie da sie juz zgubic zmiana arkusza — brak nazwy przestaje byc
 * mozliwy, zamiast byc tylko pilnowany. Argument z poprzedniego komentarza
 * ("etykieta zmienia sie ze stanem, wiec tekst, nie `aria-label`") nie bronil
 * spana: `aria-label` zmienia sie ze stanem dokladnie tak samo, a stan i tak
 * niesie maszynowo `aria-expanded`.
 *
 * Bramka: `tests/e2e/nawigacja-mobilna.spec.ts` (360 px, z ramieniem
 * negatywnym — zdjecie nazwy MUSI wywrocic skan axe).
 */
const LINKS = [
  { href: "/szkolenia", label: "Katalog" },
  { href: "/trenerzy", label: "Trenerzy" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

/**
 * `/szkolenia` jest biezace takze na `/szkolenia/<slug>`. Korzen jest wylaczony
 * z porownania prefiksem, bo `"/x".startsWith("/")` jest prawdziwe dla kazdej
 * sciezki — bez tego kazdy link bylby `aria-current="page"`.
 */
function isCurrent(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  /*
   * Panel zamyka sie na kazda zmiane adresu — nawigacja klientem nie
   * przemontowuje naglowka, wiec bez tego menu zostawaloby otwarte nad nowa
   * trescia.
   *
   * To jest korekta stanu W TRAKCIE RENDERU, a nie efekt. `useEffect` z
   * `setOpen(false)` byloby tu dwoma renderami zamiast jednego (i lapie je
   * regula `react-hooks/set-state-in-effect`), a przez jedna klatke panel
   * bylby jeszcze widoczny nad nowym widokiem. React przerywa render od razu
   * i liczy go ponownie z nowym stanem, zanim cokolwiek trafi na ekran.
   *
   * Zamkniecie na `onClick` linku nie wystarczyloby: nie obsluguje cofania
   * ani przejscia wywolanego z innego miejsca niz sam panel.
   */
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  return (
    /*
     * Escape zamyka panel i oddaje fokus przelacznikowi (UX-D2, ISK-406).
     * Nasluch siedzi na `<header>`, a nie na `document`: wszystko, co moze byc
     * wtedy ogniskowane — przelacznik i linki panelu — lezy wewnatrz tego
     * elementu, wiec zdarzenie i tak tu dobabelkuje, a nasluch globalny
     * wymagalby efektu i sprzatania po nim.
     *
     * Fokus wraca SYNCHRONICZNIE w tym miejscu, nie w `useEffect` na `open`:
     * panel zamyka sie takze po kliknieciu linku (zmiana adresu, korekta stanu
     * wyzej), a wtedy fokus nalezy do nowego dokumentu. Efekt na `[open]`
     * odbieralby go i odrzucal na przelacznik po KAZDYM przejsciu.
     */
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        setOpen(false);
        toggleRef.current?.focus();
      }}
    >
      <div className="site-header-bar ui-container">
        <Link
          aria-label="Szkolenia ISKT — strona główna"
          className="site-brand"
          href="/"
        >
          <span aria-hidden="true" className="site-brand-mark">
            ISKT
          </span>
          <span aria-hidden="true" className="site-brand-text">
            Rozwijaj swoje kompetencje z ISKT
          </span>
        </Link>

        <nav aria-label="Główna nawigacja" className="site-nav">
          {LINKS.map(({ href, label }) => (
            <Link
              aria-current={isCurrent(pathname, href) ? "page" : undefined}
              className="site-nav-link"
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="site-header-actions">
          <ButtonLink
            className="site-header-cta"
            href="/kontakt"
            size="sm"
            variant="primary"
          >
            Zapytaj o szkolenie
            <Icon className="site-header-cta-icon" name="arrow-right" />
          </ButtonLink>

          <IconButton
            aria-controls={panelId}
            aria-expanded={open}
            className="site-nav-toggle"
            label={open ? "Zamknij menu" : "Otwórz menu"}
            onClick={() => setOpen((value) => !value)}
            ref={toggleRef}
            size="sm"
            variant="neutral"
          >
            <Icon name="chevron-down" size={18} />
          </IconButton>
        </div>
      </div>

      {/* Panel jest w DOM tylko gdy otwarty. Drugi `nav` stale obecny
          duplikowalby landmark nawigacji na kazdym widoku (defekt POW-1,
          `docs/qa/raport-e6.md`); ponizej 60 rem `display: none` zdejmuje
          z drzewa dostepnosci ten pierwszy, wiec ujawniony jest zawsze
          dokladnie jeden. */}
      {open ? (
        <nav
          aria-label="Nawigacja mobilna"
          className="site-nav-panel"
          id={panelId}
        >
          <div className="site-nav-panel-inner ui-container">
            {LINKS.map(({ href, label }) => (
              <Link
                aria-current={isCurrent(pathname, href) ? "page" : undefined}
                className="site-nav-panel-link"
                href={href}
                key={href}
              >
                {label}
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
