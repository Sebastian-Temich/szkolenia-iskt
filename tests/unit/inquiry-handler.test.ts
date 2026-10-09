import { beforeEach, describe, expect, it } from "vitest";

import { HONEYPOT_FIELD } from "@/lib/antispam/honeypot";
import type { ThrottleStore } from "@/lib/antispam/throttle";
import { processInquiry, type HandlerDeps } from "@/lib/inquiries/handler";
import type { InquiryRecord, InquiryRepository } from "@/lib/inquiries/service";
import type { MailAdapter } from "@/lib/mail";
import { getRodoClauseVersion } from "@/lib/rodo/clause";
import { MAX_TOKEN_AGE_MS, issueFormToken } from "@/lib/security/form-token";

const SECRET = "test-form-token-secret-0123456789-abcdef";
const SALT = "test-throttle-salt-0123456789-abcdefghij";
const NOW = new Date("2026-10-09T12:00:00Z");

function makeDeps(overrides?: Partial<HandlerDeps>): { deps: HandlerDeps; inserted: InquiryRecord[] } {
  const inserted: InquiryRecord[] = [];
  const repo: InquiryRepository = {
    async insert(record) {
      inserted.push(record);
      return { id: "inq-1" };
    },
    async markNotification() {},
    async recordSuspectedSpam() {},
  };
  const mail: MailAdapter = {
    async send() {
      return { transport: "log", id: "log:test" };
    },
  };
  const throttleStore: ThrottleStore = {
    async countAcceptedSince() {
      return 0;
    },
    async record() {},
  };
  const deps: HandlerDeps = {
    repo,
    mail,
    throttleStore,
    notificationTo: "biuro@example.invalid",
    tokenSecret: SECRET,
    throttleSalt: SALT,
    now: () => NOW,
    ...overrides,
  };
  return { deps, inserted };
}

function postRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  kind: "osoba",
  fullName: "Jan Kowalski",
  email: "jan.kowalski@example.com",
  phone: "+48 600 100 200",
  interestArea: "Szkolenia BHP",
  message: "Dzien dobry, prosze o kontakt w sprawie szkolenia dla zespolu.",
  rodoAck: true,
};

describe("processInquiry — wersja klauzuli RODO (ISK-357 T3)", () => {
  let freshTokenBody: Record<string, unknown>;

  beforeEach(() => {
    const issuedAt = NOW.getTime() - 10_000; // 10 s temu: po MIN_FILL, przed wygasnieciem
    freshTokenBody = { ...validBody, formToken: issueFormToken(SECRET, issuedAt) };
  });

  it("zapisuje wersje ustalona przez serwer, ignorujac wartosc z ciala zadania", async () => {
    const { deps, inserted } = makeDeps();
    const response = await processInquiry(
      postRequest({ ...freshTokenBody, rodoClauseVersion: "v9-nieistniejaca" }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.rodoClauseVersion).toBe(getRodoClauseVersion());
    expect(inserted[0]?.rodoClauseVersion).not.toBe("v9-nieistniejaca");
  });
});

describe("processInquiry — token czasowy (ISK-357 T4)", () => {
  it("zwraca uczciwy blad 422 przy wygasnietym tokenie i NIC nie zapisuje", async () => {
    const { deps, inserted } = makeDeps();
    const issuedAt = NOW.getTime() - (MAX_TOKEN_AGE_MS + 1_000);
    const response = await processInquiry(
      postRequest({ ...validBody, formToken: issueFormToken(SECRET, issuedAt) }),
      deps,
    );
    expect(response.status).toBe(422);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toBe("form_expired");
    expect(inserted).toHaveLength(0);
  });

  it("nadal odrzuca honeypot cichym sukcesem (200) bez zapisu", async () => {
    const { deps, inserted } = makeDeps();
    const issuedAt = NOW.getTime() - 10_000;
    const response = await processInquiry(
      postRequest({
        ...validBody,
        formToken: issueFormToken(SECRET, issuedAt),
        [HONEYPOT_FIELD]: "http://spam.example",
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(inserted).toHaveLength(0);
  });

  it("nadal odrzuca zbyt szybkie wypelnienie cichym sukcesem (200) bez zapisu", async () => {
    const { deps, inserted } = makeDeps();
    const issuedAt = NOW.getTime() - 500; // < MIN_FILL_MS
    const response = await processInquiry(
      postRequest({ ...validBody, formToken: issueFormToken(SECRET, issuedAt) }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(inserted).toHaveLength(0);
  });
});
