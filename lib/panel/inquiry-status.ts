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
