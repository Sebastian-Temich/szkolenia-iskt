"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { ButtonLink, Icon } from "@/components/ui";

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
    <header className="site-header">
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

          <button
            aria-controls={panelId}
            aria-expanded={open}
            className="site-nav-toggle ui-button ui-button-neutral ui-button-sm ui-button-icon"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {/* Nazwa dostepna na tekscie, nie na `aria-label`: etykieta zmienia
                sie wraz ze stanem, a `aria-expanded` i tak niesie stan
                maszynowo. Tekst jest ukryty wzrokowo, nie dla czytnika. */}
            <span className="ui-visually-hidden">
              {open ? "Zamknij menu" : "Otwórz menu"}
            </span>
            <Icon name="chevron-down" size={18} />
          </button>
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
