import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/panel/auth";

import { saveCategory } from "../../../actions";

export default async function CategoryEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const isNew = id === "nowa";
  const { data: category } = isNew
    ? { data: null }
    : await supabase.from("categories").select("*").eq("id", id).single();
  if (!isNew && !category) notFound();
  return (
    <section>
      <p className="panel-eyebrow">Kategoria</p>
      <h1>{isNew ? "Dodaj kategorię" : `Edytuj: ${category?.name}`}</h1>
      <form action={saveCategory} className="panel-form">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}
        <label>
          Nazwa
          <input name="name" required defaultValue={category?.name ?? ""} />
        </label>
        <label>
          Slug
          <input name="slug" required defaultValue={category?.slug ?? ""} />
        </label>
        <label>
          Opis
          <textarea
            name="description"
            defaultValue={category?.description ?? ""}
          />
        </label>
        <label>
          Kolejność
          <input
            name="sort_order"
            type="number"
            min="0"
            defaultValue={category?.sort_order ?? 100}
          />
        </label>
        <button className="panel-button">Zapisz kategorię</button>
      </form>
    </section>
  );
}
