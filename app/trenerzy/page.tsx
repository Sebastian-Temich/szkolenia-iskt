import { getPublishedTrainers } from "@/lib/catalog/public";

export const revalidate = 3600;

export default async function PublicTrainersPage() {
  const trainers = await getPublishedTrainers();
  return (
    <main className="public-catalog">
      <p className="panel-eyebrow">Eksperci ISKT</p>
      <h1>Trenerzy</h1>
      {trainers.length ? (
        <div className="panel-grid">
          {trainers.map((trainer) => (
            <article className="panel-card" key={trainer.id}>
              <h2>{trainer.full_name}</h2>
              <p>{trainer.headline}</p>
              <p>{trainer.bio}</p>
            </article>
          ))}
        </div>
      ) : (
        <p>Profile trenerów pojawią się wkrótce.</p>
      )}
    </main>
  );
}
