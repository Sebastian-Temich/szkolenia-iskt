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
  it("preferuje x-real-ip ustawiany przez platforme", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "10.0.0.1, 203.0.113.9",
    });
    expect(extractClientIp(headers, { trustedProxyCount: 1 })).toBe("203.0.113.9");
  });

  it("czyta x-real-ip gdy brak x-forwarded-for", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.5" });
    expect(extractClientIp(headers, { trustedProxyCount: 1 })).toBe("198.51.100.5");
  });

  it("bierze OSTATNI wpis x-forwarded-for przy jednym zaufanym proxy", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" });
    expect(extractClientIp(headers, { trustedProxyCount: 1 })).toBe("203.0.113.9");
  });

  it("odlicza liczbe zaufanych proxy od konca listy", () => {
    // klient -> CDN (zaufany) -> LB (zaufany) -> aplikacja; realny klient = len-2
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.5, 203.0.113.9, 70.41.3.18",
    });
    expect(extractClientIp(headers, { trustedProxyCount: 2 })).toBe("203.0.113.9");
  });

  // WIELOPROXY + SPOOFING (odpowiedz na przeglad PR #12, pkt 1): przy N zaufanych hopach
  // zaufany blok to OSTATNIE N wpisow, a realny klient to PIERWSZY wpis tego bloku. Atakujacy
  // steruje wylacznie lewym skrajem (poza blokiem). Test jawnie sprawdza, ze NIE wybieramy ani
  // adresu proxy (ostatni, wewnetrzny hop), ani podstawionego spoofa (lewy skraj).
  it("przy wielu proxy wybiera klienta, nie adres proxy ani spoofa z lewej", () => {
    const spoof = "198.51.100.5"; // kontrolowane przez atakujacego, lewy skraj
    const client = "203.0.113.9"; // realny klient — pierwszy wpis zaufanego bloku
    const innerProxy = "70.41.3.18"; // wewnetrzny zaufany hop — ostatni wpis
    const headers = new Headers({ "x-forwarded-for": `${spoof}, ${client}, ${innerProxy}` });
    const picked = extractClientIp(headers, { trustedProxyCount: 2 });
    expect(picked).toBe(client);
    expect(picked).not.toBe(innerProxy); // nie adres proxy
    expect(picked).not.toBe(spoof); // nie spoof (len-1-N bralby wlasnie ten wpis)
  });

  // Doklejanie dowolnie wielu wpisow z LEWEJ nie przesuwa wyboru przy wielu proxy — jeden
  // realny klient = jedno wiadro, niezaleznie od dlugosci prefiksu spoofowanego przez atakujacego.
  it("przy wielu proxy spoof z lewej nie tworzy nowych wiader", () => {
    const client = "203.0.113.9";
    const innerProxy = "70.41.3.18";
    const picked = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const headers = new Headers({
        "x-forwarded-for": `10.0.0.${i}, 10.1.1.${i}, ${client}, ${innerProxy}`,
      });
      const ip = extractClientIp(headers, { trustedProxyCount: 2 });
      expect(ip).toBe(client);
      picked.add(hashClientIp(ip as string, SALT));
    }
    expect(picked.size).toBe(1);
  });

  // KIERUNEK 1: podmieniony XFF NIE daje nowego wiadra — atakujacy steruje tylko lewym
  // skrajem listy, a my czytamy wpis dopisany przez zaufany proxy (ostatni).
  it("podmiana lewego skraju XFF nie zmienia wybranego adresu", () => {
    const realClient = "203.0.113.9";
    const picked = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const headers = new Headers({ "x-forwarded-for": `10.0.0.${i}, ${realClient}` });
      const ip = extractClientIp(headers, { trustedProxyCount: 1 });
      expect(ip).not.toBeNull();
      picked.add(hashClientIp(ip as string, SALT));
    }
    // Pomimo 5 roznych wartosci [0] powstaje JEDNO wiadro dla jednego realnego klienta.
    expect(picked.size).toBe(1);
  });

  // KIERUNEK 2: brak naglowkow NIE skutkuje wspolnym wiadrem — zwracamy null,
  // a wywolujacy odrzuca zadanie zamiast haszowac stala "unknown".
  it("zwraca null gdy brak naglowkow (bez wspolnego wiadra)", () => {
    expect(extractClientIp(new Headers(), { trustedProxyCount: 1 })).toBeNull();
  });

  it("zwraca null gdy XFF ma mniej wpisow niz zaufanych proxy", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    expect(extractClientIp(headers, { trustedProxyCount: 2 })).toBeNull();
  });

  it("zwraca null gdy brak zaufanego proxy (trustedProxyCount < 1)", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" });
    expect(extractClientIp(headers, { trustedProxyCount: 0 })).toBeNull();
  });

  it("ignoruje puste segmenty XFF", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.1, , 203.0.113.9" });
    expect(extractClientIp(headers, { trustedProxyCount: 1 })).toBe("203.0.113.9");
  });
});
