import Link from "next/link";
import { notFound } from "next/navigation";

import { Field, Icon, Input, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";

import { saveCategory } from "../../../actions";
import { SubmitButton } from "../../../submit-button";

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
      {/* „Wroc do listy" wprost ze wzorca — w produkcie to link do trasy,
          a nie `onClick` zmieniajacy stan w kliencie. */}
      <Link className="panel-back-link" href="/panel/szkolenia">
        <Icon name="arrow-left" size={16} />
        Wróć do listy
      </Link>
      <p className="panel-eyebrow">Kategoria</p>
      <h1>{isNew ? "Dodaj kategorię" : `Edytuj: ${category?.name}`}</h1>
      <form action={saveCategory} className="panel-form panel-form-card">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}
        {/* `Field` wymaga `id` i wiaze `label htmlFor` — wczesniej etykieta
            OWIJALA kontrolke bez `htmlFor`, czyli tak jak we wzorcu.
            `required` zostaje na kontrolce (niesie `aria-required`), ale NIE na
            `Field`: `Field required` dokleja gwiazdke do tresci etykiety,
            a bramki panelu dopasowuja etykiety przez
            `getByLabel(..., { exact: true })`. */}
        <div className="panel-fields">
          <Field id="category-name" label="Nazwa">
            <Input
              id="category-name"
              name="name"
              required
              defaultValue={category?.name ?? ""}
            />
          </Field>
          <Field id="category-slug" label="Slug">
            <Input
              id="category-slug"
              name="slug"
              required
              defaultValue={category?.slug ?? ""}
            />
          </Field>
        </div>
        <Field id="category-description" label="Opis">
          <Textarea
            id="category-description"
            name="description"
            defaultValue={category?.description ?? ""}
          />
        </Field>
        <Field id="category-sort" label="Kolejność">
          <Input
            id="category-sort"
            name="sort_order"
            type="number"
            min="0"
            defaultValue={category?.sort_order ?? 100}
          />
        </Field>
        <div className="panel-form-actions">
          <Link
            className="panel-button panel-button-quiet"
            href="/panel/szkolenia"
          >
            Anuluj
          </Link>
          <SubmitButton>Zapisz kategorię</SubmitButton>
        </div>
      </form>
    </section>
  );
}
