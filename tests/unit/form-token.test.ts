import { describe, expect, it } from "vitest";

import {
  MAX_TOKEN_AGE_MS,
  MIN_FILL_MS,
  issueFormToken,
  verifyFormToken,
} from "@/lib/security/form-token";

const SECRET = "test-form-token-secret-0123456789-abcdef";

describe("form token (HMAC czasowy)", () => {
  it("wydaje token weryfikowalny po minimalnym czasie wypelnienia", () => {
    const issuedAt = 1_000_000;
    const token = issueFormToken(SECRET, issuedAt);
    const result = verifyFormToken(token, SECRET, issuedAt + MIN_FILL_MS + 500);
    expect(result.ok).toBe(true);
  });

  it("odrzuca zbyt szybkie wypelnienie (< 3 s)", () => {
    const issuedAt = 1_000_000;
    const token = issueFormToken(SECRET, issuedAt);
    const result = verifyFormToken(token, SECRET, issuedAt + 1_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_fast");
  });

  it("odrzuca token przedawniony (> 60 min)", () => {
    const issuedAt = 1_000_000;
    const token = issueFormToken(SECRET, issuedAt);
    const result = verifyFormToken(token, SECRET, issuedAt + MAX_TOKEN_AGE_MS + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("odrzuca token z podrobiona sygnatura", () => {
    const issuedAt = 1_000_000;
    const token = issueFormToken(SECRET, issuedAt);
    const tampered = token.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    const result = verifyFormToken(tampered, SECRET, issuedAt + MIN_FILL_MS + 500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("odrzuca token podpisany innym sekretem", () => {
    const issuedAt = 1_000_000;
    const token = issueFormToken(SECRET, issuedAt);
    const result = verifyFormToken(token, "inny-sekret-0123456789-abcdefghij", issuedAt + MIN_FILL_MS + 500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("odrzuca token o zlym formacie", () => {
    const result = verifyFormToken("śmieci", SECRET, 2_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });
});
