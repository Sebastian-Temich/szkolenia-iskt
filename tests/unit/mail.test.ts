import { describe, expect, it, vi } from "vitest";

import { createLogMailAdapter } from "@/lib/mail";

describe("log mail adapter", () => {
  it("logs identifiers and result without recipient or message content", async () => {
    const logger = vi.fn();
    const adapter = createLogMailAdapter(logger);

    const result = await adapter.send({
      inquiryId: "inquiry-123",
      requestId: "request-456",
      to: "person@example.invalid",
      subject: "Poufny temat",
      text: "Poufna treść",
    });

    expect(result).toEqual({ transport: "log", id: "log:request-456" });
    expect(logger).toHaveBeenCalledWith({
      event: "mail.sent",
      inquiryId: "inquiry-123",
      requestId: "request-456",
      transport: "log",
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      "person@example.invalid",
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain("Poufna");
  });
});
