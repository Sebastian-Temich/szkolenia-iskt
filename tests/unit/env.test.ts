import { describe, expect, it } from "vitest";

import {
  isPublicEnvConfigured,
  parsePublicEnv,
  parseServerEnv,
  shouldPrerenderWithoutData,
} from "@/lib/env";

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

describe("prerender katalogu bez konfiguracji publicznej", () => {
  const buildPhase = { NEXT_PHASE: "phase-production-build" };

  it("pozwala zbudować pustą powłokę w CI bez kluczy Supabase", () => {
    expect(shouldPrerenderWithoutData(buildPhase)).toBe(true);
  });

  it("pobiera dane, gdy build ma pełną konfigurację publiczną", () => {
    expect(shouldPrerenderWithoutData({ ...buildPhase, ...publicValues })).toBe(
      false,
    );
  });

  it("nie degraduje odpowiedzi w czasie żądania — brak konfiguracji zostaje błędem", () => {
    expect(shouldPrerenderWithoutData({})).toBe(false);
    expect(
      shouldPrerenderWithoutData({ NEXT_PHASE: "phase-production-server" }),
    ).toBe(false);
  });

  it("wykrywa niekompletną konfigurację publiczną", () => {
    expect(isPublicEnvConfigured(publicValues)).toBe(true);
    expect(
      isPublicEnvConfigured({
        ...publicValues,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toBe(false);
  });
});
