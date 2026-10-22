import Link from "next/link";

import { getCategories } from "@/lib/public-catalog";

/**
 * Stopka wzorca: kolumna marki (logo, opis, monospace `szkolenia.iskt.pl`),
 * trzy kolumny linkow i dolny pasek.
 *
 * DWIE WADY WZORCA NAPRAWIONE, NIE ODTWORZONE
 * 1. Linki w kolumnie "Obszary" we wzorcu NIE filtruja — wszystkie pieć wola
 *    `goKatalog`, czyli prowadza do nieprzefiltrowanego katalogu. Tutaj kazdy
 *    niesie `?category=<slug>`, wiec robi to, co obiecuje jego etykieta.
 * 2. "Polityka prywatnosci" jest we wzorcu zwyklym `span` wewnatrz napisu
 *    "Polityka prywatnosci · Regulamin" — nieklikalnym. Tutaj to realny link do
 *    `/polityka-prywatnosci`, bo ta trasa istnieje i checkbox RODO w formularzu
 *    juz na nia wskazuje. "Regulamin" nie ma trasy, wiec go nie ma — martwy
 *    link jest gorszy niz brak linku.
 *
 * DLACZEGO STOPKA SIEGA DO BAZY
 * Lista obszarow to dane, nie tresc: wzorzec ma pieć wpisanych na sztywno
 * ("AI", "ESG", "Jezyk angielski", "Software · B+R"), ktore rozjechalyby sie
 * z katalogiem przy pierwszej zmianie kategorii w panelu. Stopka stoi
 * w `app/(public)/layout.tsx`, wiec zapytanie idzie raz na render widoku,
 * a widoki publiczne poza `/kontakt` sa preranderowane (ISR).
 *
 * Bez konfiguracji Supabase (`next build` w bramce `quality` leci bez sekretow)
 * `getCategories()` zwraca pusta liste — kolumna obszarow znika zamiast
 * rozsypac stopke.
 */
export async function SiteFooter() {
  const categories = await getCategories();
  /**
   * ISK-409: bylo `const year = 2026`, renderowane jako "© 2026 ISKT" — napis
   * falszywy od 2027-01-01 i to bez zadnego sygnalu, ze sie zestarzal.
   *
   * `new Date()` w komponencie serwerowym wyliczyloby rok w chwili RENDERU,
   * a nie builda, tylko dlatego ze wszystkie trasy publiczne maja
   * `revalidate = 300` — stopka odswieza sie wiec najpozniej 5 minut po
   * zmianie roku. Gdyby ktos kiedys zdjal `revalidate` i trasa stala sie
   * w pelni statyczna, rok zapiekl by sie na nowo w czasie builda; wtedy
   * jedynym poprawnym rozwiazaniem jest policzyc go po stronie klienta.
   */
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="ui-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <span aria-hidden="true" className="footer-brand-mark">
              ISKT
            </span>
            <p className="footer-brand-text">
              [DEMO] Szkolenia rozwijające kompetencje przyszłości — dla osób
              indywidualnych i firm.
            </p>
            {/* Adres jako tekst, nie link: to ta sama witryna. */}
            <span className="footer-domain">szkolenia.iskt.pl</span>
          </div>

          {categories.length > 0 ? (
            <nav aria-labelledby="footer-obszary" className="footer-column">
              <p className="footer-column-title" id="footer-obszary">
                Obszary
              </p>
              {categories.map((category) => (
                <Link
                  className="footer-link"
                  href={`/szkolenia?category=${encodeURIComponent(category.slug)}`}
                  key={category.id}
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          ) : null}

          <nav aria-labelledby="footer-serwis" className="footer-column">
            <p className="footer-column-title" id="footer-serwis">
              Serwis
            </p>
            <Link className="footer-link" href="/szkolenia">
              Katalog szkoleń
            </Link>
            <Link className="footer-link" href="/trenerzy">
              Trenerzy
            </Link>
            <Link className="footer-link" href="/kontakt">
              Kontakt
            </Link>
            <Link className="footer-link" href="/polityka-prywatnosci">
              Polityka prywatności
            </Link>
          </nav>

          <div className="footer-column">
            <p className="footer-column-title">Kontakt</p>
            {/* Adres e-mail jako `mailto:` — we wzorcu to nieklikalny `span`. */}
            <a className="footer-link" href="mailto:biuro@iskt.pl">
              biuro@iskt.pl
            </a>
            <span className="footer-note">[DEMO] Żory, woj. śląskie</span>
          </div>
        </div>

        <div className="footer-bar">
          <p className="footer-copy">
            © {year} ISKT — środowisko demonstracyjne.
          </p>
          <p className="footer-copy">
            Wszystkie treści oznaczone [DEMO] są fikcyjne.
          </p>
        </div>
      </div>
    </footer>
  );
}
