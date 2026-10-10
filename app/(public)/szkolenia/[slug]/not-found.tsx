import Link from "next/link";
export default function NotFound() {
  return (
    <main className="section">
      <div className="empty-state page-shell">
        <p className="eyebrow">404</p>
        <h1>Nie znaleźliśmy tego szkolenia</h1>
        <p>Szkolenie nie istnieje albo nie zostało opublikowane.</p>
        <Link className="button" href="/szkolenia">
          Wróć do katalogu
        </Link>
      </div>
    </main>
  );
}
