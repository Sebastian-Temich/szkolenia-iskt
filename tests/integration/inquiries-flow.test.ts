// Testy integracyjne przeplywu zapisu zgloszenia (ADR-0004 §1, §7) na LOKALNYM stacku Supabase.
// Wywolujemy czysta funkcje obslugi `processInquiry` z repozytorium i licznikiem opartym o
// klienta service_role (helper), bez uruchamiania serwera Next. Zadnych sekretow w repo —
// sekrety antyspamowe to lokalne wartosci testowe (nie dane ISKT).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSupabaseThrottleStore } from "@/lib/antispam/throttle-store";
import { processInquiry, type HandlerDeps } from "@/lib/inquiries/handler";
import { createSupabaseInquiryRepository } from "@/lib/inquiries/repository";
import { createLogMailAdapter, type MailAdapter } from "@/lib/mail";
import { issueFormToken } from "@/lib/security/form-token";

import { serviceClient, anonClient } from "./helpers/supabase";

const TOKEN_SECRET = "integration-form-token-secret-0123456789";
const THROTTLE_SALT = "integration-throttle-salt-0123456789-abc";

const admin = serviceClient();

function baseDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    repo: createSupabaseInquiryRepository(admin),
    throttleStore: createSupabaseThrottleStore(admin),
    mail: createLogMailAdapter(() => {}),
    notificationTo: "biuro@iskt.pl",
    tokenSecret: TOKEN_SECRET,
    throttleSalt: THROTTLE_SALT,
    trustedProxyCount: 1,
    // Testy integracyjne sprawdzaja zapis — klauzula zatwierdzona (bramke P1 pokrywaja testy jednostkowe).
    rodoClauseApproved: true,
    logger: () => {},
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: "osoba",
    fullName: "Jan Kowalski",
    email: "jan@example.invalid",
    phone: "+48 600 100 200",
    interestArea: "Szkolenia BHP",
    message: "Prosze o kontakt w sprawie szkolenia dla zespolu.",
    rodoAck: true,
    rodoClauseVersion: "DRAFT-1",
    company_website: "",
    formToken: issueFormToken(TOKEN_SECRET, Date.now() - 4000),
    ...overrides,
  };
}

function request(body: unknown, ip: string) {
  return new Request("http://localhost/api/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const testEmails = [
  "happy@example.invalid",
  "mailfail@example.invalid",
  "throttle@example.invalid",
];

beforeAll(async () => {
  await admin.from("inquiries").delete().in("email", testEmails);
});

afterAll(async () => {
  await admin.from("inquiries").delete().in("email", testEmails);
});

describe("POST /api/inquiries — przeplyw zapisu", () => {
  it("zapisuje poprawne zgloszenie ze statusem 'nowe' i powiadomieniem 'sent'", async () => {
    const res = await processInquiry(
      request(validBody({ email: "happy@example.invalid" }), "203.0.113.11"),
      baseDeps(),
    );
    expect(res.status).toBe(200);

    const { data } = await admin
      .from("inquiries")
      .select("status, notification_status, kind")
      .eq("email", "happy@example.invalid")
      .single();
    expect(data?.status).toBe("nowe");
    expect(data?.notification_status).toBe("sent");
  });

  it("zapisuje zgloszenie i ustawia 'failed', gdy adapter poczty rzuca — bez bledu 5xx", async () => {
    const failingMail: MailAdapter = {
      async send() {
        throw new Error("symulowany blad Resend");
      },
    };
    const res = await processInquiry(
      request(validBody({ email: "mailfail@example.invalid" }), "203.0.113.12"),
      baseDeps({ mail: failingMail }),
    );
    expect(res.status).toBe(200);

    const { data } = await admin
      .from("inquiries")
      .select("status, notification_status")
      .eq("email", "mailfail@example.invalid")
      .single();
    expect(data?.status).toBe("nowe");
    expect(data?.notification_status).toBe("failed");
  });

  it("rola anon nie moze wstawic wiersza bezposrednio do inquiries", async () => {
    const { error } = await anonClient()
      .from("inquiries")
      .insert({
        kind: "osoba",
        full_name: "Bezposredni Atak",
        email: "anon-insert@example.invalid",
        phone: "+48600100200",
        interest_area: "x",
        message: "Proba bezposredniego zapisu z roli anon.",
        rodo_ack: true,
        rodo_clause_version: "DRAFT-1",
      });
    expect(error).not.toBeNull();
  });

  it("zwraca 429 na 4. zgloszeniu z tego samego klienta w oknie 10 minut", async () => {
    const deps = baseDeps();
    const ip = "203.0.113.200";
    for (let i = 0; i < 3; i++) {
      const ok = await processInquiry(
        request(validBody({ email: "throttle@example.invalid" }), ip),
        deps,
      );
      expect(ok.status).toBe(200);
    }
    const blocked = await processInquiry(
      request(validBody({ email: "throttle@example.invalid" }), ip),
      deps,
    );
    expect(blocked.status).toBe(429);
  });
});
