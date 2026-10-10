import { describe, expect, it } from "vitest";

import { HONEYPOT_FIELD, isHoneypotTripped } from "@/lib/antispam/honeypot";

describe("honeypot", () => {
  it("eksponuje nazwe pola-pulapki", () => {
    expect(HONEYPOT_FIELD).toBe("company_website");
  });

  it("wykrywa wypelnione pole-pulapke", () => {
    expect(isHoneypotTripped("https://spam.example")).toBe(true);
    expect(isHoneypotTripped("   x   ")).toBe(true);
  });

  it("ignoruje puste lub brakujace pole", () => {
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
    expect(isHoneypotTripped(undefined)).toBe(false);
    expect(isHoneypotTripped(null)).toBe(false);
  });
});
