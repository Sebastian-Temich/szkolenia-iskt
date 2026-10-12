import { describe, expect, it } from "vitest";

import {
  assertNoEmailHeaderInjection,
  hasLineBreak,
} from "@/lib/security/header-injection";

describe("hasLineBreak", () => {
  it("wykrywa CR, LF oraz CRLF", () => {
    expect(hasLineBreak("Jan\rKowalski")).toBe(true);
    expect(hasLineBreak("Jan\nKowalski")).toBe(true);
    expect(hasLineBreak("Jan\r\nKowalski")).toBe(true);
  });

  it("przepuszcza zwykly tekst jednoliniowy (takze z tabulatorem i spacja)", () => {
    expect(hasLineBreak("Jan Kowalski")).toBe(false);
    expect(hasLineBreak("ACME\tsp. z o.o.")).toBe(false);
    expect(hasLineBreak("")).toBe(false);
  });
});

describe("assertNoEmailHeaderInjection", () => {
  const ok = {
    from: "powiadomienia@iskt.pl",
    to: "biuro@iskt.pl",
    subject: "Nowe zgloszenie",
  };

  it("przechodzi dla poprawnych pol naglowkowych", () => {
    expect(() => assertNoEmailHeaderInjection(ok)).not.toThrow();
  });

  it.each([
    ["subject", { ...ok, subject: "Nowe zgloszenie\r\nBcc: evil@example.com" }],
    ["to", { ...ok, to: "biuro@iskt.pl\nBcc: evil@example.com" }],
    ["from", { ...ok, from: "powiadomienia@iskt.pl\rX-Spoof: 1" }],
  ])("rzuca gdy pole %s zawiera CR/LF", (_field, fields) => {
    expect(() => assertNoEmailHeaderInjection(fields)).toThrow(
      "mail_header_injection",
    );
  });
});
