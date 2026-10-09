import { createHmac } from "node:crypto";

// Identyfikator klienta do limitu czestosci (ADR-0004 §3 warstwa 3). NIE zapisujemy surowego
// adresu IP ani User-Agenta — przechowujemy wylacznie HMAC-SHA256(IP, FORM_THROTTLE_SALT).
// Minimalizacja danych wg `04_Ryzyka/RODO i dane osobowe.md`.
//
// SOL JEST STABILNA (ISK-357 P2). `client_hash` to pseudonimizacja, nie anonimizacja: kto ma sol,
// odtwarza IP przez enumeracje ~4,3 mld adresow IPv4, a hasze o stalej soli sa miedzy soba
// powiazywalne. NIE rozwiazujemy tego rotacja soli — rotacja zerowalaby kroczace liczniki na
// granicy doby UTC i otwierala obejscie limitu (3/10 min, 10/24 h). Powiazywalnosc ograniczamy
// NIEZALEZNIE przez retencje: `purge_submission_throttle()` (migracja 20261009120600) usuwa wiersze
// starsze niz 24 h, wiec w magazynie nie ma czego powiazac poza oknem retencji — a liczenie w
// kroczacym oknie pozostaje poprawne, bo klucz haszujacy sie nie zmienia.

export function hashClientIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

// Odczyt adresu klienta z naglowkow proxy. Zwraca pierwszy adres z `x-forwarded-for`
// lub `x-real-ip`; null gdy nieustalony (wtedy limit stosujemy per-brak-adresu ostroznie).
export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
