import { randomUUID } from "node:crypto";

import { HONEYPOT_FIELD, isHoneypotTripped } from "@/lib/antispam/honeypot";
import { isSuspectedSpam } from "@/lib/antispam/links";
import { evaluateThrottle, type ThrottleStore } from "@/lib/antispam/throttle";
import {
  persistInquiry,
  type InquiryRecord,
  type InquiryRepository,
} from "@/lib/inquiries/service";
import type { MailAdapter } from "@/lib/mail";
import { extractClientIp, hashClientIp } from "@/lib/security/client-hash";
import { verifyFormToken } from "@/lib/security/form-token";
import { logServerEvent, safeErrorCode, type SafeLogger } from "@/lib/security/safe-log";
import { inquirySchema } from "@/lib/validation/inquiry";

// Czysta funkcja obslugi POST /api/inquiries (ADR-0004 §1). Kolejnosc warstw:
// Content-Type/rozmiar → honeypot → token czasowy → limit czestosci → walidacja Zod → zapis.
// Zwraca generyczne komunikaty (ADR-0004 §6) — bez echa wartosci wejsciowych i bez danych
// osobowych. Zaleznosci wstrzykiwane, aby przeplyw byl testowalny bez serwera i bez sekretow.

export type HandlerDeps = {
  repo: InquiryRepository;
  mail: MailAdapter;
  throttleStore: ThrottleStore;
  notificationTo: string;
  tokenSecret: string;
  throttleSalt: string;
  now?: () => Date;
  logger?: SafeLogger;
  sourcePath?: string;
};

const MAX_BODY_BYTES = 16 * 1024;

const SUCCESS_MESSAGE = "Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.";
const THROTTLE_MESSAGE = "Zbyt wiele zgłoszeń z tego połączenia. Spróbuj ponownie później.";
const SERVER_ERROR_MESSAGE =
  "Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na biuro@iskt.pl.";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function processInquiry(request: Request, deps: HandlerDeps): Promise<Response> {
  const requestId = randomUUID();
  const log: SafeLogger = deps.logger ?? (() => {});
  const now = deps.now ?? (() => new Date());

  // 1. Content-Type.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }

  // 2. Rozmiar zadania i parsowanie JSON.
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "size" });
    return json(413, { error: "payload_too_large" });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not-an-object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // 3. Honeypot — odrzucenie z odpowiedzia "sukces" (nie informujemy bota o detekcji).
  if (isHoneypotTripped(body[HONEYPOT_FIELD])) {
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "honeypot", outcome: "silent_success" });
    return json(200, { message: SUCCESS_MESSAGE });
  }

  // 4. Token czasowy — zbyt szybkie/przedawnione/podrobione odrzucamy jako "sukces".
  const token = typeof body.formToken === "string" ? body.formToken : "";
  const tokenResult = verifyFormToken(token, deps.tokenSecret, now().getTime());
  if (!tokenResult.ok) {
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "token", outcome: tokenResult.reason });
    return json(200, { message: SUCCESS_MESSAGE });
  }

  // 5. Limit czestosci na haszowanym IP.
  const ip = extractClientIp(request.headers) ?? "unknown";
  const clientHash = hashClientIp(ip, deps.throttleSalt);
  const decision = await evaluateThrottle(deps.throttleStore, clientHash, now());
  if (!decision.allowed) {
    await deps.throttleStore.record(clientHash, "rejected", now());
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "throttle", outcome: decision.scope });
    return json(429, { error: "too_many_requests", message: THROTTLE_MESSAGE });
  }

  // 6. Walidacja Zod — niezaleznie od klienta, zrodlo prawdy.
  const result = inquirySchema.safeParse(body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "validation" });
    return json(400, { error: "validation_error", fields: fieldErrors });
  }
  const data = result.data;

  // 7. Zapis (zrodlo prawdy) + powiadomienie (best-effort).
  try {
    const record: InquiryRecord = {
      kind: data.kind,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      companyName: data.companyName,
      trainingId: data.trainingId,
      interestArea: data.interestArea,
      message: data.message,
      rodoAck: data.rodoAck,
      rodoClauseVersion: data.rodoClauseVersion,
      sourcePath: deps.sourcePath,
    };
    const outcome = await persistInquiry(
      {
        repo: deps.repo,
        mail: deps.mail,
        notificationTo: deps.notificationTo,
        now,
        logger: deps.logger,
      },
      record,
      { requestId, suspectedSpam: isSuspectedSpam(data.message) },
    );
    await deps.throttleStore.record(clientHash, "accepted", now());
    logServerEvent(log, {
      event: "inquiry.accepted",
      requestId,
      inquiryId: outcome.inquiryId,
      notificationStatus: outcome.notificationStatus,
    });
    return json(200, { message: SUCCESS_MESSAGE });
  } catch (error) {
    logServerEvent(log, { event: "inquiry.error", requestId, errorCode: safeErrorCode(error) });
    return json(500, { error: "server_error", message: SERVER_ERROR_MESSAGE, requestId });
  }
}
