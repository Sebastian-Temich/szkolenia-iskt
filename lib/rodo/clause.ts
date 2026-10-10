// =============================================================================
// PLACEHOLDER TRESCI PRAWNEJ — BRAMKA ISKT (ADR-0004 "Wymagane decyzje ISKT" pkt 4).
// Tresc klauzuli informacyjnej RODO NIE jest zatwierdzona. NIE wymyslamy tresci prawnej.
// Do czasu zatwierdzenia przez ISKT formularz dziala wylacznie w srodowisku lokalnym.
// Wersja jest zapisywana w inquiries.rodo_clause_version przy kazdym zgloszeniu.
// =============================================================================

export const RODO_CLAUSE_APPROVED = false;

export const RODO_CLAUSE_VERSION = "DRAFT-0-niezatwierdzona";

export const RODO_CLAUSE_TEXT =
  "[PLACEHOLDER — TRESC NIEZATWIERDZONA PRZEZ ISKT] Tutaj znajdzie sie zatwierdzona " +
  "klauzula informacyjna RODO (administrator danych, cel i podstawa przetwarzania, okres " +
  "przechowywania, prawa osoby, odbiorcy/procesorzy). Tresci nie generuje agent — dostarcza " +
  "ja ISKT. Potwierdzenie zapoznania sie z klauzula jest wymagane do wyslania formularza.";

export function getRodoClauseVersion(): string {
  const fromEnv = process.env.RODO_CLAUSE_VERSION;
  return fromEnv && fromEnv.length > 0 ? fromEnv : RODO_CLAUSE_VERSION;
}
