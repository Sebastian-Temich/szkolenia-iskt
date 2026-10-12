// Heurystyka linkow (ADR-0004 §3 warstwa 5): wiecej niz 2 odnosniki w wiadomosci oznaczaja
// zgloszenie jako podejrzane (admin_audit_log: inquiry.suspected_spam) BEZ blokowania zapisu.
// Spam tresciowy nie moze kosztowac utraty prawdziwego zapytania — decyzje podejmuje czlowiek.

export const MAX_ALLOWED_LINKS = 2;

const LINK_PATTERN = /(https?:\/\/|www\.)/gi;

export function countLinks(text: string): number {
  const matches = text.match(LINK_PATTERN);
  return matches ? matches.length : 0;
}

export function isSuspectedSpam(text: string): boolean {
  return countLinks(text) > MAX_ALLOWED_LINKS;
}
