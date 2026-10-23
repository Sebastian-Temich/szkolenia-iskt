import Link from "next/link";
import { notFound } from "next/navigation";

import { Field, Icon, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";
import { readPanelFlash } from "@/lib/panel/flash-server";
import {
  getAllowedInquiryTransitions,
  inquiryStatusSchema,
} from "@/lib/panel/inquiry-status";
import { toOne } from "@/lib/supabase/embed";

import { changeInquiryStatus, saveInquiryNote } from "../../actions";
import { PanelFlash } from "../../panel-flash";
import { SubmitButton } from "../../submit-button";

const labels = {
  nowe: "Nowe",
  w_toku: "W toku",
  zamkniete: "Zamknięte",
} as const;
const mailLabels = {
  pending: "Oczekuje na wysyłkę",
  sent: "Wysłano",
  failed: "Wysyłka nieudana",
} as const;

const NOTE_HINT = "Najwyżej 2000 znaków. Puste pole usuwa notatkę.";

export default async function InquiryDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const flash = await readPanelFlash(await searchParams);
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("*,trainings(title)")
    .eq("id", id)
    .single();
  if (!inquiry) notFound();
  const status = inquiryStatusSchema.parse(inquiry.status);
  const transitions = getAllowedInquiryTransitions(status);
  const training = toOne(inquiry.trainings);
  return (
    <section>
      <Link className="panel-back-link" href="/panel/zgloszenia">
        <Icon name="arrow-left" size={16} />
        Wróć do listy
      </Link>
      <p className="panel-eyebrow">Zgłoszenie</p>
      <div className="panel-title-row">
        <div>
          <h1>{inquiry.full_name}</h1>
          <p>
            {new Intl.DateTimeFormat("pl-PL", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(inquiry.created_at))}
          </p>
        </div>
        <span
          className={
            status === "zamkniete"
              ? "panel-status is-large is-closed"
              : "panel-status is-large is-open"
          }
        >
          {labels[status]}
        </span>
      </div>

      {flash ? <PanelFlash message={flash} /> : null}

      <div className="panel-detail-grid">
        <article className="panel-card">
          <h2>Dane kontaktowe</h2>
          <dl>
            <dt>E-mail</dt>
            <dd>
              <a className="panel-inline-link" href={`mailto:${inquiry.email}`}>
                {inquiry.email}
              </a>
            </dd>
            <dt>Telefon</dt>
            <dd>{inquiry.phone}</dd>
            <dt>Firma</dt>
            <dd>{inquiry.company_name || "—"}</dd>
            <dt>Temat</dt>
            <dd>{training?.title || inquiry.interest_area || "—"}</dd>
          </dl>
        </article>
        <article className="panel-card">
          <h2>Powiadomienie e-mail</h2>
          <p className="panel-mail-status">
            {mailLabels[
              inquiry.notification_status as keyof typeof mailLabels
            ] ?? inquiry.notification_status}
          </p>
          {inquiry.notification_sent_at ? (
            <p>
              Wysłano:{" "}
              {new Date(inquiry.notification_sent_at).toLocaleString("pl-PL")}
            </p>
          ) : null}
        </article>
      </div>

      <article className="panel-card panel-message">
        <h2>Treść zgłoszenia</h2>
        <p>{inquiry.message}</p>
        <small>Treść jest niezmienna i chroniona po stronie bazy danych.</small>
      </article>

      {/* NOTATKA WEWNETRZNA — DODANA w ISK-402, nie przestylizowana.
          Karta i `specyfikacja-wizualna` §6 zakladaly, ze produkt juz ja ma
          i trzeba tylko zmienic wyglad. Zmierzony stan byl inny: kolumna
          `admin_note`, kolumnowy grant `update (status, admin_note)` i jawne
          dopuszczenie w triggerze istnialy w bazie od migracji
          `20261012120000`, ale w `app/` i `lib/` nie bylo ANI JEDNEGO
          wystapienia `admin_note` — notatka nigdy nie miala UI. Dolozenie go
          nie wymagalo migracji ani zmiany kontraktu backendowego.

          Formy do odtworzenia tu nie ma: wzorzec trzyma stan `inqNote`, ale
          nie podpiete do zadnego widoku. Forma jest wiec wziesta z kart
          szczegolu obok. */}
      <article className="panel-card panel-section">
        <h2>Notatka wewnętrzna</h2>
        <p>
          Widoczna wyłącznie w panelu. Nie trafia do nadawcy zgłoszenia ani na
          publiczne strony.
        </p>
        <form
          action={saveInquiryNote.bind(null, id)}
          className="panel-form"
          noValidate
        >
          <Field id="admin_note" label="Treść notatki" hint={NOTE_HINT}>
            <Textarea
              id="admin_note"
              name="admin_note"
              rows={5}
              maxLength={2000}
              defaultValue={inquiry.admin_note ?? ""}
              hint={NOTE_HINT}
            />
          </Field>
          <div className="panel-form-actions">
            <SubmitButton>Zapisz notatkę</SubmitButton>
          </div>
        </form>
      </article>

      <section className="panel-section">
        <h2>Zmień status</h2>
        {status === "zamkniete" ? (
          <p>
            Zgłoszenie jest zamknięte. Jeśli sprawa wróciła, możesz otworzyć je
            ponownie — historia statusów zostaje zachowana.
          </p>
        ) : null}
        {/* `.panel-actions .panel-button` jest tu KONTRAKTEM bramki B3:
            `tests/e2e/ux-blockers.spec.ts` mierzy na tym selektorze kontrast
            i alfe wlasnego tla. Defekt 1,03:1 (bialy tekst na tle strony)
            przezyl dwie rundy poprawek, bo testy sprawdzaly OBECNOSC
            przycisku, a nie jego widocznosc. */}
        <div className="panel-actions">
          {transitions.map((next) => (
            <form key={next} action={changeInquiryStatus.bind(null, id, next)}>
              <button className="panel-button" type="submit">
                Ustaw: {labels[next]}
              </button>
            </form>
          ))}
        </div>
      </section>
    </section>
  );
}
