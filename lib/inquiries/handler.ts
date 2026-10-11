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
import { getRodoClauseVersion } from "@/lib/rodo/clause";
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
  trustedProxyCount: number;
  // Techniczna bramka RODO (ISK-357 P1): gdy false, serwer odrzuca kazdy zapis. Wstrzykiwane,
  // aby przeplyw byl testowalny w obu stanach; runtime przekazuje tu `isRodoClauseApproved()`.
  rodoClauseApproved: boolean;
  now?: () => Date;
  logger?: SafeLogger;
  sourcePath?: string;
};

const MAX_BODY_BYTES = 16 * 1024;

const SUCCESS_MESSAGE = "Dziękujemy za zgłoszenie. Odpowiemy na podany adres e-mail.";
const THROTTLE_MESSAGE = "Zbyt wiele zgłoszeń z tego połączenia. Spróbuj ponownie później.";
const EXPIRED_MESSAGE =
  "Formularz był otwarty zbyt długo i sesja wygasła. Odśwież formularz i wyślij zgłoszenie ponownie — nic nie zostało jeszcze zapisane.";
const SERVER_ERROR_MESSAGE =
  "Nie udało się przyjąć zgłoszenia. Spróbuj ponownie lub napisz na biuro@iskt.pl.";
const CLAUSE_NOT_APPROVED_MESSAGE =
  "Formularz zgłoszeniowy jest chwilowo niedostępny. Napisz na biuro@iskt.pl — Twoja wiadomość nie została zapisana.";

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

  // 0. Techniczna bramka RODO (ISK-357 P1). Dopoki klauzula nie jest zatwierdzona, endpoint jest
  // zamkniety — zaden zapis nie powstaje. To uczciwy blad (nie cichy sukces, nie 200): osoba nie
  // moze byc wprowadzona w blad, ze jej dane sa przetwarzane (art. 5 ust. 1 lit. a RODO). UI blokuje
  // wyslanie rownolegle; serwer jest zrodlem prawdy i nie ufa klientowi.
  if (!deps.rodoClauseApproved) {
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "clause_not_approved" });
    return json(503, { error: "clause_not_approved", message: CLAUSE_NOT_APPROVED_MESSAGE });
  }

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

  // 4. Token czasowy. `honeypot`/`too_fast`/`bad_signature`/`malformed` to sygnaly bota —
  // odrzucamy je jako ciche "sukces", zeby nie informowac o detekcji (ADR-0004 §6). WYJATEK:
  // `expired` to realny scenariusz ludzki (formularz otwarty > 60 min) — cichy sukces oklamywalby
  // osobe, ze dane sa przetwarzane (art. 5 ust. 1 lit. a RODO), a zgloszenie przepadaloby. Dla
  // `expired` zwracamy uczciwy blad z prosba o ponowne wyslanie (ISK-357 T4).
  const token = typeof body.formToken === "string" ? body.formToken : "";
  const tokenResult = verifyFormToken(token, deps.tokenSecret, now().getTime());
  if (!tokenResult.ok) {
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "token", outcome: tokenResult.reason });
    if (tokenResult.reason === "expired") {
      return json(422, { error: "form_expired", message: EXPIRED_MESSAGE });
    }
    return json(200, { message: SUCCESS_MESSAGE });
  }

  // 5. Limit czestosci na haszowanym IP. Adresu kontrolowanego przez klienta NIE uzywamy
  // (E7 W2): bez godnego zaufania adresu odrzucamy zadanie, zamiast wrzucac wszystkich do
  // wspolnego wiadra "unknown" (ktore bylo trywialnym DoS-em i obejsciem limitu naraz).
  // Sol jest STABILNA (ISK-357 P2): kroczace okna 10 min / 24 h musza byc egzekwowane bez przerwy,
  // takze przez granice doby UTC — rotacja klucza zerowalaby liczniki o polnocy i otwierala obejscie
  // limitu. Powiazywalnosc haszy ograniczamy niezaleznie: `purge_submission_throttle()` usuwa wiersze
  // starsze niz 24 h, wiec w magazynie nie ma czego powiazac poza oknem retencji (pseudonimizacja
  // ograniczona retencja, nie podmiana klucza).
  const ip = extractClientIp(request.headers, { trustedProxyCount: deps.trustedProxyCount });
  if (ip === null) {
    logServerEvent(log, { event: "inquiry.rejected", requestId, layer: "throttle", outcome: "no_client_ip" });
    return json(429, { error: "too_many_requests", message: THROTTLE_MESSAGE });
  }
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
      // Wersje klauzuli ustala serwer (ISK-357 T3) — pole z ciala zadania jest ignorowane, bo
      // rekord ma dowodzic, KTORA klauzule faktycznie pokazano (rozliczalnosc, art. 5 ust. 2 RODO),
      // a nie powtarzac wartosc dowolnie podmienialna przez skladajacego.
      rodoClauseVersion: getRodoClauseVersion(),
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
