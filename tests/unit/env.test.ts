import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

const publicValues = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-public-key",
};

describe("environment validation", () => {
  it("accepts a complete public configuration", () => {
    expect(parsePublicEnv(publicValues)).toEqual(publicValues);
  });

  it("reports missing public variables without exposing values", () => {
    expect(() => parsePublicEnv({})).toThrowError(
      /Nieprawidłowa konfiguracja publiczna.*NEXT_PUBLIC_SITE_URL.*NEXT_PUBLIC_SUPABASE_URL/s,
    );
  });

  it("allows the log mail adapter without Resend credentials", () => {
    expect(
      parseServerEnv({
        ...publicValues,
        MAIL_TRANSPORT: "log",
      }).MAIL_TRANSPORT,
    ).toBe("log");
  });

  it("requires Resend credentials only for the resend adapter", () => {
    expect(() =>
      parseServerEnv({
        ...publicValues,
        MAIL_TRANSPORT: "resend",
      }),
    ).toThrowError(/RESEND_API_KEY.*RESEND_FROM/s);
  });
});
