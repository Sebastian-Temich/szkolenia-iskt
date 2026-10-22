import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Checkbox,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";

import { saveTraining } from "../../actions";
import { SubmitButton } from "../../submit-button";

const OUTCOMES_HINT =
  "Jedna korzyść w wierszu. Puste pole ukrywa tę sekcję na publicznej stronie.";
const SEO_TITLE_HINT =
  "Do 70 znaków. Puste pole — wyszukiwarka pokaże nazwę szkolenia.";
const SEO_DESCRIPTION_HINT =
  "Do 160 znaków. Puste pole — wyszukiwarka pokaże krótki wstęp.";

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
      <Link className="panel-back-link" href="/panel/szkolenia">
        <Icon name="arrow-left" size={16} />
        Wróć do listy
      </Link>
      <p className="panel-eyebrow">
        {isNew ? "Nowa pozycja" : "Edycja szkolenia"}
      </p>
      <h1>{isNew ? "Dodaj szkolenie" : training?.title}</h1>
      {/* Podtytul wzorca, przyciety do prawdy: wzorzec obiecuje „karta i strona
          kursu zbuduja sie automatycznie", a u nas pole `program` nie ma jeszcze
          edytora (dlug opisany w ISK-374), wiec strona szczegolu nie zbuduje
          sie w calosci. */}
      <p>Uzupełnij pola — karta szkolenia i strona kursu zbudują się z nich.</p>

      {/* Etykiety pol sa KONTRAKTEM bramki `panel-katalog.spec.ts`, ktora
          dopasowuje je przez `getByLabel(..., { exact: true })` (m.in. „Tytul"
          wobec „Tytul SEO"). Dlatego `Field` nie dostaje `required` — ten prop
          dokleja gwiazdke do tresci etykiety. Wymog niesie `required` na samej
          kontrolce, czyli `aria-required` dla czytnika ekranu. */}
      <form action={saveTraining} className="panel-form panel-form-card">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}
        <div className="panel-fields">
          <Field id="training-title" label="Tytuł">
            <Input
              id="training-title"
              name="title"
              required
              defaultValue={training?.title ?? ""}
            />
          </Field>
          <Field id="training-slug" label="Slug">
            <Input
              id="training-slug"
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              defaultValue={training?.slug ?? ""}
            />
          </Field>
        </div>
        <Field id="training-summary" label="Podsumowanie">
          <Textarea
            id="training-summary"
            name="summary"
            required
            minLength={10}
            defaultValue={training?.summary ?? ""}
          />
        </Field>
        <Field id="training-description" label="Opis">
          <Textarea
            id="training-description"
            name="description"
            rows={7}
            defaultValue={training?.description ?? ""}
          />
        </Field>
        <div className="panel-fields">
          <Field id="training-category" label="Kategoria">
            <Select
              id="training-category"
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
            </Select>
          </Field>
          <Field id="training-level" label="Poziom">
            <Select
              id="training-level"
              name="level"
              defaultValue={training?.level ?? "podstawowy"}
            >
              <option value="podstawowy">Podstawowy</option>
              <option value="sredniozaawansowany">Średniozaawansowany</option>
              <option value="zaawansowany">Zaawansowany</option>
            </Select>
          </Field>
        </div>
        <div className="panel-fields">
          <Field id="training-duration" label="Czas (godz.)">
            <Input
              id="training-duration"
              name="duration_hours"
              type="number"
              step="0.5"
              min="0.5"
              required
              defaultValue={training?.duration_hours ?? 8}
            />
          </Field>
          <Field id="training-price" label="Cena netto PLN">
            <Input
              id="training-price"
              name="price_net_pln"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={training?.price_net_pln ?? 0}
            />
          </Field>
        </div>
        <Field
          id="training-outcomes"
          label="Czego się nauczysz"
          hint={OUTCOMES_HINT}
        >
          <Textarea
            id="training-outcomes"
            name="learning_outcomes"
            rows={5}
            hint={OUTCOMES_HINT}
            defaultValue={(
              (training?.learning_outcomes as string[] | null) ?? []
            ).join("\n")}
          />
        </Field>
        <Field id="training-audience" label="Dla kogo">
          <Textarea
            id="training-audience"
            name="target_audience"
            rows={3}
            defaultValue={training?.target_audience ?? ""}
          />
        </Field>
        <Field id="training-terms" label="Najbliższe terminy">
          <Textarea
            id="training-terms"
            name="terms_note"
            defaultValue={training?.terms_note ?? ""}
          />
        </Field>
        <Checkbox
          id="training-funding"
          name="funding_available"
          boxed
          label="Dostępne dofinansowanie"
          defaultChecked={training?.funding_available ?? false}
        />
        <Field id="training-funding-note" label="Informacja o dofinansowaniu">
          <Textarea
            id="training-funding-note"
            name="funding_note"
            rows={2}
            defaultValue={training?.funding_note ?? ""}
          />
        </Field>
        <Checkbox
          id="training-featured"
          name="is_featured"
          boxed
          label="Pokaż w sekcji „Szkolenia, które wyróżniamy” na stronie głównej"
          defaultChecked={training?.is_featured ?? false}
        />
        <div className="panel-fields">
          <Field
            id="training-seo-title"
            label="Tytuł SEO"
            hint={SEO_TITLE_HINT}
          >
            <Input
              id="training-seo-title"
              name="seo_title"
              maxLength={70}
              hint={SEO_TITLE_HINT}
              defaultValue={training?.seo_title ?? ""}
            />
          </Field>
          <Field
            id="training-seo-description"
            label="Opis SEO"
            hint={SEO_DESCRIPTION_HINT}
          >
            <Input
              id="training-seo-description"
              name="seo_description"
              maxLength={160}
              hint={SEO_DESCRIPTION_HINT}
              defaultValue={training?.seo_description ?? ""}
            />
          </Field>
        </div>
        <fieldset>
          <legend>Trenerzy</legend>
          <div className="panel-check-list">
            {trainers?.map((trainer) => (
              <Checkbox
                key={trainer.id}
                id={`training-trainer-${trainer.id}`}
                name="trainer_ids"
                value={trainer.id}
                label={trainer.full_name}
                defaultChecked={selected.has(trainer.id)}
              />
            ))}
          </div>
        </fieldset>
        <Field id="training-sort" label="Kolejność">
          <Input
            id="training-sort"
            name="sort_order"
            type="number"
            min="0"
            defaultValue={training?.sort_order ?? 100}
          />
        </Field>
        <div className="panel-form-actions">
          <Link
            className="panel-button panel-button-quiet"
            href="/panel/szkolenia"
          >
            Anuluj
          </Link>
          <SubmitButton>Zapisz szkolenie</SubmitButton>
        </div>
      </form>
    </section>
  );
}
