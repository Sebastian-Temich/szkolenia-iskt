import { createHmac } from "node:crypto";

// Identyfikator klienta do limitu czestosci (ADR-0004 §3 warstwa 3). NIE zapisujemy surowego
// adresu IP ani User-Agenta — przechowujemy wylacznie HMAC-SHA256(IP, FORM_THROTTLE_SALT).
// Minimalizacja danych wg `04_Ryzyka/RODO i dane osobowe.md`.

export function hashClientIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

// Rotacja dobowa soli (ISK-357, RODO §5a). `client_hash` to pseudonimizacja, nie anonimizacja:
// kto ma stala sol, odtwarza IP przez enumeracje ~4,3 mld adresow IPv4, a hasze pozostaja trwale
// powiazywalne miedzy soba. Mieszamy baze soli z data UTC (YYYY-MM-DD), wiec powiazywalnosc
// spada do 24 h i pokrywa sie z zadeklarowana retencja licznikow. Koszt: zerowanie licznikow na
// granicy doby UTC — nieistotne dla okien 10 min / 24 h.
export function dailyThrottleSalt(baseSalt: string, now: Date): string {
  const dayKey = now.toISOString().slice(0, 10);
  return createHmac("sha256", baseSalt).update(dayKey).digest("hex");
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
