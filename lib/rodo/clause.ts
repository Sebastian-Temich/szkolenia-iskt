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

// Techniczna bramka zgody (ISK-357 P1). Dopoki klauzula nie jest zatwierdzona, formularz NIE moze
// przyjmowac zgloszen — to nie tylko ostrzezenie w UI. Serwer odrzuca zapis, a UI blokuje wyslanie
// (rzetelnosc i przejrzystosc, art. 5 ust. 1 lit. a RODO: osoba nie moze byc wprowadzona w blad, ze
// jej dane sa przetwarzane). Stala pozostaje `false` — ISKT nie zatwierdzilo tresci. Operator wlacza
// formularz dopiero po wstawieniu realnej klauzuli, ustawiajac RODO_CLAUSE_APPROVED=true w srodowisku
// (dev/CI uzywa tego do przetestowania sciezki zapisu). Sam placeholder tresci nie wystarcza.
export function isRodoClauseApproved(): boolean {
  return RODO_CLAUSE_APPROVED || process.env.RODO_CLAUSE_APPROVED === "true";
}
