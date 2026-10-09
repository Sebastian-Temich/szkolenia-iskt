import { z } from "zod";

export const inquiryStatusSchema = z.enum(["nowe", "w_toku", "zamkniete"]);

export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;

const transitions: Record<InquiryStatus, readonly InquiryStatus[]> = {
  nowe: ["w_toku"],
  w_toku: ["zamkniete"],
  zamkniete: [],
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
