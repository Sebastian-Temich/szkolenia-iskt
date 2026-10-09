import { describe, expect, it } from "vitest";

import {
  THROTTLE_LIMITS,
  type ThrottleStore,
  evaluateThrottle,
} from "@/lib/antispam/throttle";

type Row = { outcome: "accepted" | "rejected"; at: number };

function fakeStore(rows: Row[]): ThrottleStore {
  return {
    async countAcceptedSince(_clientHash, since) {
      const sinceMs = since.getTime();
      return rows.filter((r) => r.outcome === "accepted" && r.at >= sinceMs).length;
    },
    async record(_clientHash, outcome, at) {
      rows.push({ outcome, at: at.getTime() });
    },
  };
}

const NOW = 1_700_000_000_000;
const HASH = "client-hash-abc";

describe("evaluateThrottle", () => {
  it("przepuszcza, gdy brak wczesniejszych zgloszen", async () => {
    const decision = await evaluateThrottle(fakeStore([]), HASH, new Date(NOW));
    expect(decision.allowed).toBe(true);
  });

  it("blokuje 4. zgloszenie w oknie 10 minut", async () => {
    const rows: Row[] = [
      { outcome: "accepted", at: NOW - 1 * 60_000 },
      { outcome: "accepted", at: NOW - 2 * 60_000 },
      { outcome: "accepted", at: NOW - 3 * 60_000 },
    ];
    const decision = await evaluateThrottle(fakeStore(rows), HASH, new Date(NOW));
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.scope).toBe("short");
  });

  it("nie liczy zgloszen sprzed okna 10 minut do limitu krotkiego", async () => {
    const rows: Row[] = [
      { outcome: "accepted", at: NOW - 11 * 60_000 },
      { outcome: "accepted", at: NOW - 12 * 60_000 },
      { outcome: "accepted", at: NOW - 13 * 60_000 },
    ];
    const decision = await evaluateThrottle(fakeStore(rows), HASH, new Date(NOW));
    expect(decision.allowed).toBe(true);
  });

  it("blokuje 11. zgloszenie w oknie 24 godzin", async () => {
    const rows: Row[] = Array.from({ length: 10 }, (_v, i) => ({
      outcome: "accepted" as const,
      at: NOW - (i + 1) * 30 * 60_000,
    }));
    const decision = await evaluateThrottle(fakeStore(rows), HASH, new Date(NOW));
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.scope).toBe("long");
  });

  it("eksponuje limity zgodne z ADR-0004 (3/10min, 10/24h)", () => {
    expect(THROTTLE_LIMITS.short).toEqual({ max: 3, windowMs: 10 * 60_000 });
    expect(THROTTLE_LIMITS.long).toEqual({ max: 10, windowMs: 24 * 60 * 60_000 });
  });

  // ISK-357 P2: okno jest kroczace, nie kalendarzowe. Odrzucona rotacja dobowa soli zerowalaby
  // liczniki o polnocy UTC — tu dowodzimy, ze przejscie przez polnoc NIE resetuje limitu, bo klucz
  // (client_hash) jest staly, a okno liczy sie wzglednie od `now`.
  describe("przejscie przez polnoc UTC (okno kroczace)", () => {
    const MIDNIGHT = Date.parse("2026-10-10T00:00:00Z");

    it("blokuje 4. zgloszenie gdy 3 przyjeto tuz przed polnoca a 4. jest tuz po (okno 10 min)", async () => {
      const rows: Row[] = [
        { outcome: "accepted", at: MIDNIGHT - 2 * 60_000 }, // 23:58
        { outcome: "accepted", at: MIDNIGHT - 1 * 60_000 }, // 23:59
        { outcome: "accepted", at: MIDNIGHT - 30_000 }, // 23:59:30
      ];
      const decision = await evaluateThrottle(fakeStore(rows), HASH, new Date(MIDNIGHT + 2 * 60_000)); // 00:02
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.scope).toBe("short");
    });

    it("blokuje w oknie 24 h gdy 10 zgloszen rozciaga sie przez polnoc UTC", async () => {
      // 10 zgloszen co 2 h wstecz: najstarsze ok. 20 h temu, wszystkie w kroczacym oknie 24 h,
      // mimo ze lezą po obu stronach polnocy.
      const rows: Row[] = Array.from({ length: 10 }, (_v, i) => ({
        outcome: "accepted" as const,
        at: MIDNIGHT + 2 * 60 * 60_000 - (i + 1) * 2 * 60 * 60_000,
      }));
      const decision = await evaluateThrottle(fakeStore(rows), HASH, new Date(MIDNIGHT + 2 * 60 * 60_000)); // 02:00
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.scope).toBe("long");
    });
  });
});
