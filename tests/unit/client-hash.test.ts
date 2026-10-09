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

describe("hashClientIp — sol stabilna (ISK-357 P2)", () => {
  // Sol NIE jest rotowana (odrzucono rotacje dobowa): kroczace okna limitu 10 min / 24 h musza
  // byc egzekwowane takze przez granice doby UTC, a rotacja klucza zerowalaby liczniki o polnocy.
  // Ten sam IP + ta sama sol daje ten sam hasz niezaleznie od chwili — dowod, ze klucz jest staly,
  // wiec liczenie w oknie jest ciagle. Powiazywalnosc ograniczamy retencja (purge_submission_throttle),
  // nie podmiana klucza.
  it("ten sam hasz dla tego samego IP po obu stronach polnocy UTC", () => {
    const ip = "203.0.113.7";
    const before = hashClientIp(ip, SALT); // chwila nie wplywa na hasz — sol jest stabilna
    const after = hashClientIp(ip, SALT);
    expect(before).toBe(after);
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
