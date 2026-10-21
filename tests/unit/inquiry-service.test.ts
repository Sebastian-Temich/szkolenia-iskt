import { describe, expect, it, vi } from "vitest";

import type { MailAdapter } from "@/lib/mail";
import {
  type InquiryRecord,
  type InquiryRepository,
  persistInquiry,
} from "@/lib/inquiries/service";

const record: InquiryRecord = {
  kind: "osoba",
  fullName: "Jan Kowalski",
  email: "jan@example.invalid",
  phone: "+48600100200",
  message: "Prosze o kontakt w sprawie szkolenia.",
  interestArea: "BHP",
  rodoAck: true,
  rodoClauseVersion: "DRAFT-1",
};

function fakeRepo() {
  const calls: { inserted: InquiryRecord[]; notifications: unknown[]; spam: string[] } = {
    inserted: [],
    notifications: [],
    spam: [],
  };
  const repo: InquiryRepository = {
    async insert(r) {
      calls.inserted.push(r);
      return { id: "inq-1" };
    },
    async markNotification(id, status, detail) {
      calls.notifications.push({ id, status, detail });
    },
    async recordSuspectedSpam(id) {
      calls.spam.push(id);
    },
  };
  return { repo, calls };
}

const okMail: MailAdapter = {
  async send() {
    return { transport: "log", id: "log:ok" };
  },
};

describe("persistInquiry — zapis przed wysylka (ADR-0004 §1)", () => {
  it("zapisuje zgloszenie i oznacza powiadomienie jako wyslane", async () => {
    const { repo, calls } = fakeRepo();
    const result = await persistInquiry(
      { repo, mail: okMail, notificationTo: "biuro@iskt.pl" },
      record,
      { requestId: "req-1", suspectedSpam: false },
    );

    expect(calls.inserted).toHaveLength(1);
    expect(result).toEqual({ inquiryId: "inq-1", notificationStatus: "sent" });
    expect(calls.notifications).toEqual([
      expect.objectContaining({ id: "inq-1", status: "sent" }),
    ]);
  });

  it("NIE kasuje zgloszenia i NIE rzuca, gdy wysylka zawodzi", async () => {
    const { repo, calls } = fakeRepo();
    const failingMail: MailAdapter = {
      async send() {
        throw new Error("Resend 500 dla biuro@iskt.pl");
      },
    };

    const result = await persistInquiry(
      { repo, mail: failingMail, notificationTo: "biuro@iskt.pl", logger: vi.fn() },
      record,
      { requestId: "req-2", suspectedSpam: false },
    );

    expect(calls.inserted).toHaveLength(1);
    expect(result.notificationStatus).toBe("failed");
    expect(result.inquiryId).toBe("inq-1");
    expect(calls.notifications).toEqual([
      expect.objectContaining({ id: "inq-1", status: "failed" }),
    ]);
  });

  it("nie zapisuje danych osobowych w sladzie bledu powiadomienia", async () => {
    const { repo, calls } = fakeRepo();
    const failingMail: MailAdapter = {
      async send() {
        throw new Error("blad dla jan@example.invalid");
      },
    };
    await persistInquiry(
      { repo, mail: failingMail, notificationTo: "biuro@iskt.pl", logger: vi.fn() },
      record,
      { requestId: "req-3", suspectedSpam: false },
    );
    expect(JSON.stringify(calls.notifications)).not.toContain("jan@example.invalid");
  });

  it("oznacza podejrzenie spamu bez blokowania zapisu", async () => {
    const { repo, calls } = fakeRepo();
    const result = await persistInquiry(
      { repo, mail: okMail, notificationTo: "biuro@iskt.pl" },
      record,
      { requestId: "req-4", suspectedSpam: true },
    );
    expect(calls.spam).toEqual(["inq-1"]);
    expect(result.notificationStatus).toBe("sent");
  });
});
