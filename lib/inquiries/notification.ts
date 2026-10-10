import type { InquiryRecord } from "@/lib/inquiries/service";
import type { MailMessage } from "@/lib/mail";

// Budowa powiadomienia dla biura (ADR-0004 §5). Tresc powiadomienia zawiera dane zglaszajacego
// (to jest cel powiadomienia), ale trafia wylacznie do warstwy poczty — NIE do logow serwera.

export type NotificationMeta = { inquiryId: string; requestId: string; to: string };

export function renderInquiryNotification(
  record: InquiryRecord,
  meta: NotificationMeta,
): MailMessage {
  const subjectName = record.kind === "firma" ? record.companyName ?? record.fullName : record.fullName;
  const subject = `Nowe zgłoszenie (${record.kind}) — ${subjectName}`;

  const lines = [
    `Rodzaj: ${record.kind}`,
    `Imię i nazwisko: ${record.fullName}`,
    record.companyName ? `Firma: ${record.companyName}` : null,
    `E-mail: ${record.email}`,
    `Telefon: ${record.phone}`,
    record.trainingId ? `Szkolenie (ID): ${record.trainingId}` : null,
    record.interestArea ? `Obszar: ${record.interestArea}` : null,
    "",
    "Wiadomość:",
    record.message,
    "",
    `Zgoda RODO: tak (wersja klauzuli: ${record.rodoClauseVersion})`,
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n");

  return {
    inquiryId: meta.inquiryId,
    requestId: meta.requestId,
    to: meta.to,
    subject,
    text,
  };
}
