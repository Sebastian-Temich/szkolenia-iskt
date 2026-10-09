import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/panel/auth";
import {
  getAllowedInquiryTransitions,
  inquiryStatusSchema,
} from "@/lib/panel/inquiry-status";
import { toOne } from "@/lib/supabase/embed";

import { changeInquiryStatus } from "../../actions";

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

export default async function InquiryDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
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
        <span className="panel-status is-large">{labels[status]}</span>
      </div>
      <div className="panel-detail-grid">
        <article className="panel-card">
          <h2>Dane kontaktowe</h2>
          <dl>
            <dt>E-mail</dt>
            <dd>
              <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
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
      <section className="panel-section">
        <h2>Zmień status</h2>
        {transitions.length ? (
          <div className="panel-actions">
            {transitions.map((next) => (
              <form
                key={next}
                action={changeInquiryStatus.bind(null, id, next)}
              >
                <button className="panel-button">Ustaw: {labels[next]}</button>
              </form>
            ))}
          </div>
        ) : (
          <p>Zgłoszenie jest zamknięte.</p>
        )}
      </section>
    </section>
  );
}
