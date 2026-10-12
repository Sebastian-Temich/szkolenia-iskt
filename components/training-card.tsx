import Link from "next/link";
import type { Training } from "@/lib/public-catalog";

export function TrainingCard({ training }: { training: Training }) {
  return (
    <article className="training-card">
      <div className="card-topline">
        <span className="pill">
          {training.category?.name ?? "[DEMO] Szkolenie"}
        </span>
        {training.duration_hours && (
          <span>{training.duration_hours} godz.</span>
        )}
      </div>
      <h2>
        <Link href={`/szkolenia/${training.slug}`}>{training.title}</Link>
      </h2>
      <p>{training.summary}</p>
      <div className="card-footer">
        <span>{training.level ?? "Poziom otwarty"}</span>
        <Link href={`/szkolenia/${training.slug}`}>Zobacz szczegóły →</Link>
      </div>
    </article>
  );
}
