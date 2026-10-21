import { z } from "zod";

export const inquiryStatusSchema = z.enum(["nowe", "w_toku", "zamkniete"]);

export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

/**
 * Cztery przejścia zatwierdzone w ADR-0003 (D7) i `model-danych.md` §3.6 — dokładnie ten
 * sam zbiór, który egzekwuje trigger `enforce_inquiry_admin_update()` w bazie. Mapa była
 * węższa (`nowe → w_toku → zamkniete`, bez powrotu), więc zgłoszenie zamknięte omyłkowo
 * dało się otworzyć wyłącznie zapytaniem SQL na bazie, a spamu nie dało się zamknąć bez
 * przejścia przez „w toku” (ISK-374 BL-B). Rozszerzenie mapy ponad zbiór z triggera byłoby
 * błędem w drugą stronę: panel pokazałby przycisk, który baza odrzuci.
 */
const transitions: Record<InquiryStatus, readonly InquiryStatus[]> = {
  nowe: ["w_toku", "zamkniete"],
  w_toku: ["zamkniete"],
  zamkniete: ["w_toku"],
};

export function getAllowedInquiryTransitions(
  status: InquiryStatus,
): readonly InquiryStatus[] {
  return transitions[status];
}

/**
 * Jedyne źródło prawdy o cyklu statusów — używane zarówno przez widok panelu,
 * jak i przez Server Action, żeby prezentacja i egzekwowanie nie mogły się
 * rozjechać.
 */
export function isAllowedInquiryTransition(
  current: InquiryStatus,
  next: InquiryStatus,
): boolean {
  return getAllowedInquiryTransitions(current).includes(next);
}
