import { createHmac, timingSafeEqual } from "node:crypto";

// Podpisany HMAC-em token czasowy (ADR-0004 §3 warstwa 2). Serwer wydaje token przy renderze
// formularza; weryfikacja odrzuca wypelnienia zbyt szybkie (< 3 s), przedawnione (> 60 min)
// oraz tokeny o nieprawidlowej sygnaturze. Sekret FORM_TOKEN_SECRET jest wylacznie serwerowy.

export const MIN_FILL_MS = 3_000;
export const MAX_TOKEN_AGE_MS = 60 * 60_000;

export type TokenFailureReason = "malformed" | "bad_signature" | "too_fast" | "expired";
export type TokenVerification = { ok: true; issuedAt: number } | { ok: false; reason: TokenFailureReason };

function sign(issuedAt: number, secret: string): string {
  return createHmac("sha256", secret).update(String(issuedAt)).digest("hex");
}

export function issueFormToken(secret: string, now: number = Date.now()): string {
  const issuedAt = Math.floor(now);
  return `${issuedAt}.${sign(issuedAt, secret)}`;
}

function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyFormToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): TokenVerification {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const [issuedRaw, signature] = token.split(".");
  if (!issuedRaw || !signature || !/^\d+$/.test(issuedRaw) || !/^[0-9a-f]+$/.test(signature)) {
    return { ok: false, reason: "malformed" };
  }
  const issuedAt = Number.parseInt(issuedRaw, 10);
  if (!Number.isFinite(issuedAt)) {
    return { ok: false, reason: "malformed" };
  }
  if (!signaturesMatch(signature, sign(issuedAt, secret))) {
    return { ok: false, reason: "bad_signature" };
  }
  const elapsed = now - issuedAt;
  if (elapsed < MIN_FILL_MS) {
    return { ok: false, reason: "too_fast" };
  }
  if (elapsed > MAX_TOKEN_AGE_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, issuedAt };
}
