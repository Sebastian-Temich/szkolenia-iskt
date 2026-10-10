import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid page-shell">
        <div>
          <strong>ISKT</strong>
          <p>Szkolenia demonstracyjne — lokalne MVP.</p>
        </div>
        <div>
          <p className="eyebrow">Nawigacja</p>
          <Link href="/szkolenia">Katalog</Link>
          <Link href="/trenerzy">Trenerzy</Link>
          <Link href="/kontakt">Kontakt</Link>
        </div>
        <p className="demo-note">
          Wszystkie treści oznaczone [DEMO] są fikcyjne.
        </p>
      </div>
    </footer>
  );
}
