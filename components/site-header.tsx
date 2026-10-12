import Link from "next/link";

const links = [
  ["/szkolenia", "Szkolenia"],
  ["/trenerzy", "Trenerzy"],
  ["/kontakt", "Kontakt"],
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="nav-shell page-shell">
        <Link
          className="brand"
          href="/"
          aria-label="Szkolenia ISKT — strona główna"
        >
          <span className="brand-mark" aria-hidden="true">
            ISKT
          </span>
          <span>Rozwijaj kompetencje z ISKT</span>
        </Link>
        <nav aria-label="Główna nawigacja">
          {links.map(([href, label]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <Link className="button button-small" href="/kontakt">
          Zapytaj o szkolenie <span aria-hidden="true">→</span>
        </Link>
      </div>
    </header>
  );
}
