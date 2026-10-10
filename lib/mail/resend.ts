import type { MailAdapter, MailMessage, MailResult } from "@/lib/mail";
import { logServerEvent, safeErrorCode, type SafeLogger } from "@/lib/security/safe-log";

// Adapter Resend (ADR-0004 §5): wylacznie serwerowo, RESEND_API_KEY nigdy w kliencie.
// 1 ponowienie z krotkim backoffem. Logi zawieraja wylacznie identyfikatory i wynik —
// NIGDY adresata ani tresci. SDK importowany leniwie; w testach wstrzykujemy `client`.

export type ResendSendResult = { data?: { id: string } | null; error?: unknown };

export type ResendLike = {
  emails: {
    send(params: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
    }): Promise<ResendSendResult>;
  };
};

export type ResendAdapterOptions = {
  apiKey: string;
  from: string;
  client?: ResendLike;
  logger?: SafeLogger;
  maxAttempts?: number;
  retryDelayMs?: number;
};

export function createResendMailAdapter(options: ResendAdapterOptions): MailAdapter {
  const logger: SafeLogger = options.logger ?? (() => {});
  const maxAttempts = options.maxAttempts ?? 2; // 1 pierwotna proba + 1 ponowienie
  let clientPromise: Promise<ResendLike> | null = null;

  async function resolveClient(): Promise<ResendLike> {
    if (options.client) return options.client;
    if (!clientPromise) {
      clientPromise = import("resend").then(
        (mod) => new mod.Resend(options.apiKey) as unknown as ResendLike,
      );
    }
    return clientPromise;
  }

  return {
    async send(message: MailMessage): Promise<MailResult> {
      const client = await resolveClient();
      let lastErrorCode = "error";

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const response = await client.emails.send({
          from: options.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });

        if (response.data && response.data.id && !response.error) {
          logServerEvent(logger, {
            event: "mail.sent",
            inquiryId: message.inquiryId,
            requestId: message.requestId,
            transport: "resend",
          });
          return { transport: "resend", id: response.data.id };
        }

        lastErrorCode = safeErrorCode(response.error);
        logServerEvent(logger, {
          event: "mail.retry",
          inquiryId: message.inquiryId,
          requestId: message.requestId,
          transport: "resend",
          errorCode: lastErrorCode,
        });
        if (attempt < maxAttempts && options.retryDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));
        }
      }

      logServerEvent(logger, {
        event: "mail.failed",
        inquiryId: message.inquiryId,
        requestId: message.requestId,
        transport: "resend",
        errorCode: lastErrorCode,
      });
      throw new Error("resend_send_failed");
    },
  };
}
