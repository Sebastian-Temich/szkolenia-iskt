import Link from "next/link";

import { requireAdmin } from "@/lib/panel/auth";

const labels = {
  nowe: "Nowe",
  w_toku: "W toku",
  zamkniete: "Zamknięte",
} as const;
const mailLabels = {
  pending: "Oczekuje",
  sent: "Wysłano",
  failed: "Błąd wysyłki",
} as const;

export default async function InquiriesPage() {
  const { supabase } = await requireAdmin();
  const { data: inquiries } = await supabase
    .from("inquiries")
    .select(
      "id,full_name,email,company_name,status,notification_status,created_at",
    )
    .order("created_at", { ascending: false });
  return (
    <section>
      <p className="panel-eyebrow">Kontakt</p>
      <h1>Zgłoszenia</h1>
      {!inquiries?.length ? (
        <p className="panel-empty">Brak zgłoszeń.</p>
      ) : (
        <div className="panel-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nadawca</th>
                <th>Data</th>
                <th>Status</th>
                <th>E-mail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  <td>
                    <strong>{inquiry.full_name}</strong>
                    <small>{inquiry.company_name || inquiry.email}</small>
                  </td>
                  <td>
                    {new Intl.DateTimeFormat("pl-PL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(inquiry.created_at))}
                  </td>
                  <td>
                    <span className="panel-status">
                      {labels[inquiry.status as keyof typeof labels] ??
                        inquiry.status}
                    </span>
                  </td>
                  <td>
                    {mailLabels[
                      inquiry.notification_status as keyof typeof mailLabels
                    ] ?? inquiry.notification_status}
                  </td>
                  <td>
                    <Link href={`/panel/zgloszenia/${inquiry.id}`}>
                      Zobacz szczegóły
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
