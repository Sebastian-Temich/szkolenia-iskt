import { getServerEnv } from "@/lib/env";
import { createLogMailAdapter, type MailAdapter } from "@/lib/mail";
import { createResendMailAdapter } from "@/lib/mail/resend";
import { safeLogPayload } from "@/lib/security/safe-log";

// Wybor adaptera poczty na podstawie MAIL_TRANSPORT (ADR-0004 §5). Domyslnie `log` lokalnie
// i w CI. Sciezka `resend` wymaga RESEND_API_KEY i RESEND_FROM (gwarantuje schemat env).

function serverLogger(payload: Record<string, unknown>): void {
  console.info(JSON.stringify(safeLogPayload(payload)));
}

export function createMailAdapterFromEnv(): MailAdapter {
  const env = getServerEnv();
  if (env.MAIL_TRANSPORT === "resend") {
    return createResendMailAdapter({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM,
      logger: serverLogger,
      retryDelayMs: 250,
    });
  }
  return createLogMailAdapter((entry) => serverLogger({ ...entry }));
}
