import { renderInquiryNotification } from "@/lib/inquiries/notification";
import type { MailAdapter } from "@/lib/mail";
import { logServerEvent, safeErrorCode, type SafeLogger } from "@/lib/security/safe-log";

// Orkiestracja zapisu zgloszenia (ADR-0004 §1). Kluczowa regula: ZAPIS JEST ZRODLEM PRAWDY,
// powiadomienie jest best-effort. Zgloszenie zapisujemy ze statusem 'nowe' i notification
// 'pending' (DEFAULT w DB) PRZED proba wysylki. Blad poczty NIE kasuje zgloszenia i NIE rzuca.

export type InquiryRecord = {
  kind: "osoba" | "firma";
  fullName: string;
  email: string;
  phone: string;
  companyName?: string;
  trainingId?: string;
  interestArea?: string;
  message: string;
  rodoAck: true;
  rodoClauseVersion: string;
  sourcePath?: string;
};

export type NotificationStatus = "sent" | "failed";

export type InquiryRepository = {
  insert(record: InquiryRecord): Promise<{ id: string }>;
  markNotification(
    id: string,
    status: NotificationStatus,
    detail: { sentAt?: Date; errorCode?: string },
  ): Promise<void>;
  recordSuspectedSpam(id: string): Promise<void>;
};

export type PersistDeps = {
  repo: InquiryRepository;
  mail: MailAdapter;
  notificationTo: string;
  now?: () => Date;
  logger?: SafeLogger;
};

export type PersistContext = { requestId: string; suspectedSpam: boolean };

export type PersistOutcome = { inquiryId: string; notificationStatus: NotificationStatus };

export async function persistInquiry(
  deps: PersistDeps,
  record: InquiryRecord,
  ctx: PersistContext,
): Promise<PersistOutcome> {
  const now = deps.now ?? (() => new Date());
  const log: SafeLogger = deps.logger ?? (() => {});

  // 1. Zapis — zrodlo prawdy. Status 'nowe', notification_status 'pending' z DEFAULT.
  const { id } = await deps.repo.insert(record);

  // 2. Oznaczenie podejrzenia spamu (best-effort, nie blokuje).
  if (ctx.suspectedSpam) {
    try {
      await deps.repo.recordSuspectedSpam(id);
    } catch (error) {
      logServerEvent(log, {
        event: "inquiry.audit_failed",
        requestId: ctx.requestId,
        inquiryId: id,
        errorCode: safeErrorCode(error),
      });
    }
  }

  // 3. Powiadomienie (best-effort) + slad statusu.
  const message = renderInquiryNotification(record, {
    inquiryId: id,
    requestId: ctx.requestId,
    to: deps.notificationTo,
  });

  try {
    await deps.mail.send(message);
    await deps.repo.markNotification(id, "sent", { sentAt: now() });
    logServerEvent(log, {
      event: "inquiry.notification",
      requestId: ctx.requestId,
      inquiryId: id,
      notificationStatus: "sent",
    });
    return { inquiryId: id, notificationStatus: "sent" };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    try {
      await deps.repo.markNotification(id, "failed", { errorCode });
    } catch (markError) {
      logServerEvent(log, {
        event: "inquiry.mark_failed",
        requestId: ctx.requestId,
        inquiryId: id,
        errorCode: safeErrorCode(markError),
      });
    }
    logServerEvent(log, {
      event: "inquiry.notification",
      requestId: ctx.requestId,
      inquiryId: id,
      notificationStatus: "failed",
      errorCode,
    });
    return { inquiryId: id, notificationStatus: "failed" };
  }
}
