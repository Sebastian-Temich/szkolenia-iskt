import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/panel/auth";

import { saveTrainer } from "../../actions";

export default async function TrainerEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const isNew = id === "nowy";
  const { data: trainer } = isNew
    ? { data: null }
    : await supabase.from("trainers").select("*").eq("id", id).single();
  if (!isNew && !trainer) notFound();
  return (
    <section>
      <p className="panel-eyebrow">Profil prowadzącego</p>
      <h1>{isNew ? "Dodaj trenera" : trainer?.full_name}</h1>
      <form action={saveTrainer} className="panel-form panel-form-wide">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}
        <div className="panel-fields">
          <label>
            Imię i nazwisko
            <input
              name="full_name"
              required
              defaultValue={trainer?.full_name ?? ""}
            />
          </label>
          <label>
            Slug
            <input name="slug" required defaultValue={trainer?.slug ?? ""} />
          </label>
        </div>
        <label>
          Nagłówek
          <input name="headline" defaultValue={trainer?.headline ?? ""} />
        </label>
        <label>
          Biogram
          <textarea name="bio" rows={8} defaultValue={trainer?.bio ?? ""} />
        </label>
        <label>
          Kompetencje (po przecinku)
          <input
            name="competences"
            defaultValue={trainer?.competences?.join(", ") ?? ""}
          />
        </label>
        <label>
          URL zdjęcia
          <input
            name="photo_url"
            type="url"
            defaultValue={trainer?.photo_url ?? ""}
          />
          <small>Upload plików nie jest dostępny w MVP.</small>
        </label>
        <label>
          Kolejność
          <input
            name="sort_order"
            type="number"
            min="0"
            defaultValue={trainer?.sort_order ?? 100}
          />
        </label>
        <button className="panel-button">Zapisz trenera</button>
      </form>
    </section>
  );
}
