// Limit czestosci (ADR-0004 §3 warstwa 3): maks. 3 przyjete zgloszenia / 10 min oraz
// 10 / 24 h na `client_hash`. Logika jest niezalezna od magazynu — `ThrottleStore` dostarcza
// zliczanie i zapis, dzieki czemu reguly sa testowalne jednostkowo i wspolne dla DB w runtime.

export const THROTTLE_LIMITS = {
  short: { max: 3, windowMs: 10 * 60_000 },
  long: { max: 10, windowMs: 24 * 60 * 60_000 },
} as const;

export type ThrottleOutcome = "accepted" | "rejected";

export interface ThrottleStore {
  countAcceptedSince(clientHash: string, since: Date): Promise<number>;
  record(clientHash: string, outcome: ThrottleOutcome, at: Date): Promise<void>;
}

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; scope: "short" | "long" };

export async function evaluateThrottle(
  store: ThrottleStore,
  clientHash: string,
  now: Date,
): Promise<ThrottleDecision> {
  const shortSince = new Date(now.getTime() - THROTTLE_LIMITS.short.windowMs);
  const shortCount = await store.countAcceptedSince(clientHash, shortSince);
  if (shortCount >= THROTTLE_LIMITS.short.max) {
    return { allowed: false, scope: "short" };
  }

  const longSince = new Date(now.getTime() - THROTTLE_LIMITS.long.windowMs);
  const longCount = await store.countAcceptedSince(clientHash, longSince);
  if (longCount >= THROTTLE_LIMITS.long.max) {
    return { allowed: false, scope: "long" };
  }

  return { allowed: true };
}
