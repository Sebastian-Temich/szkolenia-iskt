// Honeypot (ADR-0004 §3 warstwa 1): ukryte pole `company_website`. Wypelnienie przez bota
// skutkuje odrzuceniem zgloszenia z odpowiedzia "sukces" (nie informujemy bota o detekcji).

export const HONEYPOT_FIELD = "company_website";

export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
