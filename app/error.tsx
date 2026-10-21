"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="section">
      <div className="empty-state page-shell">
        <h1>Nie udało się wczytać strony</h1>
        <p>Spróbuj ponownie. Jeśli problem nie znika, wróć później.</p>
        <button className="button" onClick={() => reset()}>
          Spróbuj ponownie
        </button>
      </div>
    </main>
  );
}
