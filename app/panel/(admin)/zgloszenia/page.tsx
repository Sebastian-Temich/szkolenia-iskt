import Link from "next/link";

import { Icon } from "@/components/ui";
import { requireAdmin } from "@/lib/panel/auth";

/**
 * Lista zgloszen (ISK-402 / M3).
 *
 * WZORZEC JEST TU UBOZSZY OD PRODUKTU — i to jest celowo nieodtworzone.
 * Jego widok zgloszen jest wylacznie do odczytu: nie ma ani statusu, ani
 * szczegolu, ani notatki wewnetrznej (slownik `INQ_ST` i stan `inqFilter`
 * istnieja w kodzie wzorca, ale nie sa podpiete do zadnego widoku). Produkt ma
 * te funkcje realnie, wraz z tabela `inquiry_status_history`. Restylizujemy je,
 * nie usuwamy — usuniecie „dla zgodnosci ze wzorcem" jest blockerem w code
 * review (granica ISK-399, §3.1 planu).
 *
 * Przenoszona jest FORMA: naglowki kolumn, mono/wyciszona meta nadawcy oraz
 * potwierdzenie wysylki jako ikona + tekst (`mail-check` / `mail-x`), nie
 * pigulka. Nieprzenoszone: pole wyszukiwania wzorca (filtr po nazwisku,
 * e-mailu i temacie) — to nowa funkcja, nie restylizacja, a zgloszenia nosza
 * dane osobowe, wiec kazda nowa sciezka ich czytania wymaga osobnej decyzji.
 */
const labels = {
  nowe: "Nowe",
  w_toku: "W toku",
  zamkniete: "Zamknięte",
} as const;

/** Klasa pigulki statusu — stan niesie TAKZE forma, nie tylko kolor. */
const statusTone = {
  nowe: "panel-status is-open",
  w_toku: "panel-status is-open",
  zamkniete: "panel-status is-closed",
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
      <div className="panel-title-row">
        <div>
          <p className="panel-eyebrow">Kontakt</p>
          <h1>Zgłoszenia</h1>
        </div>
      </div>
      {!inquiries?.length ? (
        <p className="panel-empty">Brak zgłoszeń.</p>
      ) : (
        <>
          <p className="panel-table-hint">
            Tabelę można przewijać w poziomie — kolumna „Akcje” jest po prawej
            stronie.
          </p>
          <div
            className="panel-table-wrap"
            role="region"
            aria-label="Lista zgłoszeń — tabela przewijana w poziomie"
            tabIndex={0}
          >
            <table className="panel-table">
              <thead>
                <tr>
                  <th scope="col">Zgłaszający</th>
                  <th scope="col">Data</th>
                  <th scope="col">Status</th>
                  <th scope="col">Potwierdzenie</th>
                  <th scope="col" className="panel-table-col-actions">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => {
                  const status = inquiry.status as keyof typeof labels;
                  const mail =
                    inquiry.notification_status as keyof typeof mailLabels;
                  return (
                    <tr key={inquiry.id}>
                      <th scope="row">
                        <span className="panel-table-title">
                          {inquiry.full_name}
                        </span>
                        <span className="panel-table-meta">
                          {inquiry.company_name || inquiry.email}
                        </span>
                      </th>
                      <td>
                        {new Intl.DateTimeFormat("pl-PL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(inquiry.created_at))}
                      </td>
                      <td>
                        <span className={statusTone[status] ?? "panel-status"}>
                          {labels[status] ?? inquiry.status}
                        </span>
                      </td>
                      <td>
                        {/* Ikona jest redundantna wobec tekstu obok, wiec
                            zostaje `aria-hidden` (bez `label`) — stan niesie
                            napis, ikona tylko go przyspiesza wzrokowo. */}
                        <span
                          className={
                            mail === "sent"
                              ? "panel-mail is-sent"
                              : mail === "failed"
                                ? "panel-mail is-failed"
                                : "panel-mail"
                          }
                        >
                          <Icon
                            name={mail === "sent" ? "mail-check" : "mail-x"}
                            size={16}
                          />
                          {mailLabels[mail] ?? inquiry.notification_status}
                        </span>
                      </td>
                      <td className="panel-table-col-actions">
                        <div className="panel-actions panel-actions-end">
                          <Link href={`/panel/zgloszenia/${inquiry.id}`}>
                            Zobacz szczegóły
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
