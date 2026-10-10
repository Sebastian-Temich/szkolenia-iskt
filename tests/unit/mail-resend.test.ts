import { describe, expect, it, vi } from "vitest";

import type { MailMessage } from "@/lib/mail";
import { createResendMailAdapter, type ResendLike } from "@/lib/mail/resend";

const message: MailMessage = {
  inquiryId: "inq-1",
  requestId: "req-1",
  to: "biuro@iskt.pl",
  subject: "Nowe zgloszenie",
  text: "Tresc powiadomienia z danymi zglaszajacego",
};

describe("resend mail adapter (zamockowany SDK)", () => {
  it("wysyla przez wstrzyknietego klienta i zwraca identyfikator", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "resend-123" }, error: null });
    const client: ResendLike = { emails: { send } };
    const adapter = createResendMailAdapter({
      apiKey: "re_test",
      from: "powiadomienia@iskt.pl",
      client,
      logger: vi.fn(),
    });

    const result = await adapter.send(message);

    expect(result).toEqual({ transport: "resend", id: "resend-123" });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "powiadomienia@iskt.pl", to: "biuro@iskt.pl" }),
    );
  });

  it("ponawia jednokrotnie przy bledzie i nastepnie sukcesie", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "temporary" } })
      .mockResolvedValueOnce({ data: { id: "resend-retry" }, error: null });
    const adapter = createResendMailAdapter({
      apiKey: "re_test",
      from: "powiadomienia@iskt.pl",
      client: { emails: { send } },
      logger: vi.fn(),
    });

    const result = await adapter.send(message);
    expect(result.id).toBe("resend-retry");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("rzuca po wyczerpaniu ponowienia, bez danych osobowych w logu", async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: "stale" } });
    const logger = vi.fn();
    const adapter = createResendMailAdapter({
      apiKey: "re_test",
      from: "powiadomienia@iskt.pl",
      client: { emails: { send } },
      logger,
    });

    await expect(adapter.send(message)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain("biuro@iskt.pl");
    expect(logged).not.toContain("danymi zglaszajacego");
  });
});
