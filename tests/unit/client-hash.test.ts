import { describe, expect, it } from "vitest";

import { dailyThrottleSalt, extractClientIp, hashClientIp } from "@/lib/security/client-hash";

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

describe("dailyThrottleSalt — rotacja dobowa (ISK-357 T10)", () => {
  it("jest staly w obrebie tej samej doby UTC", () => {
    const a = dailyThrottleSalt(SALT, new Date("2026-10-09T00:00:01Z"));
    const b = dailyThrottleSalt(SALT, new Date("2026-10-09T23:59:59Z"));
    expect(a).toBe(b);
  });

  it("zmienia sie na granicy doby UTC", () => {
    const d1 = dailyThrottleSalt(SALT, new Date("2026-10-09T23:59:59Z"));
    const d2 = dailyThrottleSalt(SALT, new Date("2026-10-10T00:00:00Z"));
    expect(d1).not.toBe(d2);
  });

  it("nie ujawnia bazowej soli", () => {
    expect(dailyThrottleSalt(SALT, new Date("2026-10-09T12:00:00Z"))).not.toContain(SALT);
  });

  it("zalezy od bazowej soli", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(dailyThrottleSalt(SALT, now)).not.toBe(
      dailyThrottleSalt("inna-sol-0123456789-abcdefghijklmno", now),
    );
  });

  it("rozne dni daja hasze IP niepowiazywalne wprost", () => {
    const ip = "203.0.113.7";
    const day1 = hashClientIp(ip, dailyThrottleSalt(SALT, new Date("2026-10-09T10:00:00Z")));
    const day2 = hashClientIp(ip, dailyThrottleSalt(SALT, new Date("2026-10-10T10:00:00Z")));
    expect(day1).not.toBe(day2);
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
