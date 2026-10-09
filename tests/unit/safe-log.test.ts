import { describe, expect, it, vi } from "vitest";

import { logServerEvent, safeErrorCode, safeLogPayload } from "@/lib/security/safe-log";

describe("safeLogPayload", () => {
  it("przepuszcza wylacznie pola z bialej listy", () => {
    const payload = safeLogPayload({
      event: "inquiry.received",
      requestId: "req-1",
      inquiryId: "inq-1",
      outcome: "accepted",
      notificationStatus: "failed",
      // dane osobowe, ktore NIE moga trafic do logu:
      email: "jan@example.invalid",
      fullName: "Jan Kowalski",
      phone: "+48600100200",
      message: "Poufna tresc zgloszenia",
      companyName: "ACME",
    });

    expect(payload).toEqual({
      event: "inquiry.received",
      requestId: "req-1",
      inquiryId: "inq-1",
      outcome: "accepted",
      notificationStatus: "failed",
    });
  });

  it("nie przecieka danych osobowych do serializacji", () => {
    const serialized = JSON.stringify(
      safeLogPayload({
        event: "inquiry.notification",
        requestId: "req-2",
        email: "jan@example.invalid",
        message: "Poufna tresc",
      }),
    );
    expect(serialized).not.toContain("jan@example.invalid");
    expect(serialized).not.toContain("Poufna");
  });
});

describe("safeErrorCode", () => {
  it("nie ujawnia tresci bledu zawierajacej dane osobowe", () => {
    const code = safeErrorCode(new Error("Nie udalo sie wyslac do jan@example.invalid"));
    expect(code).not.toContain("jan@example.invalid");
    expect(typeof code).toBe("string");
    expect(code.length).toBeGreaterThan(0);
  });

  it("zwraca stabilny kod dla zwyklego bledu", () => {
    expect(safeErrorCode(new Error("boom"))).toBe("error");
    expect(safeErrorCode("boom")).toBe("unknown");
  });
});

describe("logServerEvent", () => {
  it("loguje tylko bezpieczny payload", () => {
    const logger = vi.fn();
    logServerEvent(logger, {
      event: "inquiry.received",
      requestId: "req-9",
      email: "jan@example.invalid",
      message: "Poufna tresc",
    });
    const call = JSON.stringify(logger.mock.calls);
    expect(call).not.toContain("jan@example.invalid");
    expect(call).not.toContain("Poufna");
    expect(call).toContain("req-9");
  });
});
