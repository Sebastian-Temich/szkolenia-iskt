import { createSupabaseThrottleStore } from "@/lib/antispam/throttle-store";
import { getServerEnv } from "@/lib/env";
import { processInquiry, type HandlerDeps } from "@/lib/inquiries/handler";
import { createSupabaseInquiryRepository } from "@/lib/inquiries/repository";
import { createMailAdapterFromEnv } from "@/lib/mail/factory";
import { isRodoClauseApproved } from "@/lib/rodo/clause";
import { safeLogPayload } from "@/lib/security/safe-log";
import { createAdminClient } from "@/lib/supabase/admin";

// Zapis zgloszen WYLACZNIE przez ten Route Handler, runtime nodejs, kluczem service_role
// (ADR-0004 §1). Przegladarka nigdy nie pisze do `inquiries`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const env = getServerEnv();

  // Sekrety antyspamowe i adresat sa wymagane do obslugi zadania (generowane lokalnie/CI,
  // nie sa danymi ISKT). Brak = blad konfiguracji, nie cicha degradacja.
  if (!env.FORM_TOKEN_SECRET || !env.FORM_THROTTLE_SALT || !env.INQUIRY_NOTIFICATION_TO) {
    return jsonError(500, { error: "server_misconfigured" });
  }

  const admin = createAdminClient();
  const deps: HandlerDeps = {
    repo: createSupabaseInquiryRepository(admin),
    throttleStore: createSupabaseThrottleStore(admin),
    mail: createMailAdapterFromEnv(),
    notificationTo: env.INQUIRY_NOTIFICATION_TO,
    tokenSecret: env.FORM_TOKEN_SECRET,
    throttleSalt: env.FORM_THROTTLE_SALT,
    rodoClauseApproved: isRodoClauseApproved(),
    logger: (payload) => console.info(JSON.stringify(safeLogPayload(payload))),
  };

  return processInquiry(request, deps);
}
