import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/panel/auth";

import { saveTraining } from "../../actions";

export default async function TrainingEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const isNew = id === "nowe";
  const [
    { data: training },
    { data: categories },
    { data: trainers },
    { data: links },
  ] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase.from("trainings").select("*").eq("id", id).single(),
    supabase.from("categories").select("id,name").order("sort_order"),
    supabase.from("trainers").select("id,full_name").order("sort_order"),
    isNew
      ? Promise.resolve({ data: [] })
      : supabase
          .from("training_trainers")
          .select("trainer_id")
          .eq("training_id", id),
  ]);
  if (!isNew && !training) notFound();
  const selected = new Set(links?.map((link) => link.trainer_id));
  return (
    <section>
      <p className="panel-eyebrow">
        {isNew ? "Nowa pozycja" : "Edycja szkolenia"}
      </p>
      <h1>{isNew ? "Dodaj szkolenie" : training?.title}</h1>
      <form action={saveTraining} className="panel-form panel-form-wide">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}
        <div className="panel-fields">
          <label>
            Tytuł
            <input name="title" required defaultValue={training?.title ?? ""} />
          </label>
          <label>
            Slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              defaultValue={training?.slug ?? ""}
            />
          </label>
        </div>
        <label>
          Podsumowanie
          <textarea
            name="summary"
            required
            minLength={10}
            defaultValue={training?.summary ?? ""}
          />
        </label>
        <label>
          Opis
          <textarea
            name="description"
            rows={7}
            defaultValue={training?.description ?? ""}
          />
        </label>
        <div className="panel-fields">
          <label>
            Kategoria
            <select
              name="category_id"
              required
              defaultValue={training?.category_id ?? ""}
            >
              <option value="">Wybierz</option>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Poziom
            <select name="level" defaultValue={training?.level ?? "podstawowy"}>
              <option value="podstawowy">Podstawowy</option>
              <option value="sredniozaawansowany">Średniozaawansowany</option>
              <option value="zaawansowany">Zaawansowany</option>
            </select>
          </label>
        </div>
        <div className="panel-fields">
          <label>
            Czas (godz.)
            <input
              name="duration_hours"
              type="number"
              step="0.5"
              min="0.5"
              required
              defaultValue={training?.duration_hours ?? 8}
            />
          </label>
          <label>
            Cena netto PLN
            <input
              name="price_net_pln"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={training?.price_net_pln ?? 0}
            />
          </label>
        </div>
        <label>
          Najbliższe terminy
          <textarea
            name="terms_note"
            defaultValue={training?.terms_note ?? ""}
          />
        </label>
        <label className="panel-check">
          <input
            name="funding_available"
            type="checkbox"
            defaultChecked={training?.funding_available ?? false}
          />{" "}
          Dostępne dofinansowanie
        </label>
        <fieldset>
          <legend>Trenerzy</legend>
          <div className="panel-check-list">
            {trainers?.map((trainer) => (
              <label className="panel-check" key={trainer.id}>
                <input
                  type="checkbox"
                  name="trainer_ids"
                  value={trainer.id}
                  defaultChecked={selected.has(trainer.id)}
                />{" "}
                {trainer.full_name}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Kolejność
          <input
            name="sort_order"
            type="number"
            min="0"
            defaultValue={training?.sort_order ?? 100}
          />
        </label>
        <button className="panel-button" type="submit">
          Zapisz szkolenie
        </button>
      </form>
    </section>
  );
}
