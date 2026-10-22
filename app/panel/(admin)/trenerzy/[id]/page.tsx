import Link from "next/link";
import { notFound } from "next/navigation";

import { Field, Icon, Input, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";

import { saveTrainer } from "../../actions";
import { SubmitButton } from "../../submit-button";

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
      <Link className="panel-back-link" href="/panel/trenerzy">
        <Icon name="arrow-left" size={16} />
        Wróć do listy
      </Link>
      <p className="panel-eyebrow">Profil prowadzącego</p>
      <h1>{isNew ? "Dodaj trenera" : trainer?.full_name}</h1>
      {/* Podtytul wzorca. D4 z karty ISK-399: szczegol trenera
          `/trenerzy/[slug]` jest POZA V1, wiec nie obiecujemy tu „CV zbuduje
          sie automatycznie" jak wzorzec — zdanie opisuje to, co faktycznie
          powstaje, czyli karte na liscie trenerow. */}
      <p>
        Uzupełnij profil — karta trenera na liście publicznej zbuduje się z tych
        pól.
      </p>
      <form action={saveTrainer} className="panel-form panel-form-card">
        {!isNew ? <input type="hidden" name="id" value={id} /> : null}
        <div className="panel-fields">
          <Field id="trainer-full-name" label="Imię i nazwisko">
            <Input
              id="trainer-full-name"
              name="full_name"
              required
              defaultValue={trainer?.full_name ?? ""}
            />
          </Field>
          <Field id="trainer-slug" label="Slug">
            <Input
              id="trainer-slug"
              name="slug"
              required
              defaultValue={trainer?.slug ?? ""}
            />
          </Field>
        </div>
        <Field id="trainer-headline" label="Nagłówek">
          <Input
            id="trainer-headline"
            name="headline"
            defaultValue={trainer?.headline ?? ""}
          />
        </Field>
        <Field id="trainer-bio" label="Biogram">
          <Textarea
            id="trainer-bio"
            name="bio"
            rows={8}
            defaultValue={trainer?.bio ?? ""}
          />
        </Field>
        <Field id="trainer-competences" label="Kompetencje (po przecinku)">
          <Input
            id="trainer-competences"
            name="competences"
            defaultValue={trainer?.competences?.join(", ") ?? ""}
          />
        </Field>
        <Field
          id="trainer-photo-url"
          label="URL zdjęcia"
          hint="Upload plików nie jest dostępny w MVP."
        >
          <Input
            id="trainer-photo-url"
            name="photo_url"
            type="url"
            defaultValue={trainer?.photo_url ?? ""}
            hint="Upload plików nie jest dostępny w MVP."
          />
        </Field>
        <Field id="trainer-sort" label="Kolejność">
          <Input
            id="trainer-sort"
            name="sort_order"
            type="number"
            min="0"
            defaultValue={trainer?.sort_order ?? 100}
          />
        </Field>
        <div className="panel-form-actions">
          <Link
            className="panel-button panel-button-quiet"
            href="/panel/trenerzy"
          >
            Anuluj
          </Link>
          <SubmitButton>Zapisz trenera</SubmitButton>
        </div>
      </form>
    </section>
  );
}
