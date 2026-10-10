import { describe, expect, it } from "vitest";

import { extractClientIp, hashClientIp } from "@/lib/security/client-hash";

const SALT = "test-throttle-salt-0123456789-abcdefghij";

describe("hashClientIp", () => {
  it("jest deterministyczny dla tego samego IP i soli", () => {
    expect(hashClientIp("203.0.113.7", SALT)).toBe(hashClientIp("203.0.113.7", SALT));
  });

  it("rozni sie dla roznych adresow IP", () => {
    expect(hashClientIp("203.0.113.7", SALT)).not.toBe(hashClientIp("203.0.113.8", SALT));
  });

  it("nie zawiera surowego adresu IP", () => {
    const ip = "203.0.113.7";
    expect(hashClientIp(ip, SALT)).not.toContain(ip);
  });

  it("nie zawiera soli", () => {
    expect(hashClientIp("203.0.113.7", SALT)).not.toContain(SALT);
  });

  it("zmienia wynik przy zmianie soli", () => {
    expect(hashClientIp("203.0.113.7", SALT)).not.toBe(
      hashClientIp("203.0.113.7", "inna-sol-0123456789-abcdefghijklmno"),
    );
  });
});

describe("extractClientIp", () => {
  it("czyta pierwszy adres z x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(extractClientIp(headers)).toBe("203.0.113.7");
  });

  it("czyta x-real-ip gdy brak x-forwarded-for", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.5" });
    expect(extractClientIp(headers)).toBe("198.51.100.5");
  });

  it("zwraca null gdy brak naglowkow", () => {
    expect(extractClientIp(new Headers())).toBeNull();
  });
});
