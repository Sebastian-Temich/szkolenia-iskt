/**
 * ISK-374 BL-B / U2 / U3 — kontrakt zmiany statusu zgloszenia w Server Action.
 *
 * Trzy wlasnosci, ktorych nie pilnowal zaden test (sama akcja nie byla testowana):
 *
 *  BL-B: akcja przyjmuje DOKLADNIE te przejscia, ktore przyjmuje trigger
 *        `enforce_inquiry_admin_update()` — razem z ponownym otwarciem `zamkniete → w_toku`.
 *        `tests/integration/inquiry-triggers.test.ts` pilnuje strony bazy, a
 *        `tests/unit/inquiry-status.test.ts` samej mapy; tutaj chodzi o to, ze akcja
 *        faktycznie z tej mapy korzysta, a nie ma wlasnej, wezszej kopii.
 *
 *  U2:   uniewaznienie cache panelu nie moze zalezec od powodzenia zapisu dziennika —
 *        status jest juz zmieniony, wiec lista zgloszen nie moze zostac nieaktualna.
 *
 *  U3:   `details` NIE zawiera `from`. Pole bylo czytane przed UPDATE-em, wiec przy dwoch
 *        rownoleglych zmianach zapisywaloby stan z momentu odczytu, a nie faktyczny
 *        poprzedni — dziennik klamalby wzgledem `inquiry_status_history`, ktora dostaje
 *        prawdziwe `from`/`to` z `OLD.status` w triggerze.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "33333333-3333-4333-8333-333333333333";

let currentStatus = "nowe";
let updateError: { message: string } | null = null;
let rpcError: { message: string } | null = null;

const updates: Array<Record<string, unknown>> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const revalidated: string[] = [];

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/panel/catalog-cache", () => ({
  invalidatePublicCatalog: vi.fn(),
}));

vi.mock("@/lib/panel/auth", () => ({
  requireAdmin: () =>
    Promise.resolve({
      supabase: {
        from() {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { status: currentStatus },
                    error: null,
                  }),
              }),
            }),
            update: (values: Record<string, unknown>) => ({
              eq: () => {
                updates.push(values);
                return Promise.resolve({ error: updateError });
              },
            }),
          };
        },
        rpc(fn: string, args: Record<string, unknown>) {
          rpcCalls.push({ fn, args });
          return Promise.resolve({ data: 1, error: rpcError });
        },
      },
    }),
}));

const { changeInquiryStatus } = await import("@/app/panel/(admin)/actions");

beforeEach(() => {
  currentStatus = "nowe";
  updateError = null;
  rpcError = null;
  updates.length = 0;
  rpcCalls.length = 0;
  revalidated.length = 0;
});

describe("changeInquiryStatus — przejscia, cache i dziennik", () => {
  /** BL-B: cztery przejscia z ADR-0003 D7, zgodne z triggerem w bazie. */
  it.each([
    ["nowe", "w_toku"],
    ["nowe", "zamkniete"],
    ["w_toku", "zamkniete"],
    ["zamkniete", "w_toku"],
  ])("dopuszcza przejscie %s → %s", async (from, to) => {
    currentStatus = from;
    await changeInquiryStatus(ID, to);
    expect(updates).toEqual([{ status: to }]);
  });

  it.each([
    ["nowe", "nowe"],
    ["w_toku", "nowe"],
    ["zamkniete", "zamkniete"],
  ])("odrzuca przejscie %s → %s bez dotkniecia bazy", async (from, to) => {
    currentStatus = from;
    await expect(changeInquiryStatus(ID, to)).rejects.toThrow(
      "Ta zmiana statusu nie jest dozwolona.",
    );
    expect(updates).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("odrzuca status poza slownikiem", async () => {
    await expect(changeInquiryStatus(ID, "archiwum")).rejects.toThrow(
      "Niepoprawna zmiana statusu.",
    );
    expect(updates).toEqual([]);
  });

  /** U3: w dzienniku tylko status docelowy — `from` pochodzi z inquiry_status_history. */
  it("zapisuje w dzienniku wylacznie status docelowy, bez zgadywanego `from`", async () => {
    currentStatus = "zamkniete";
    await changeInquiryStatus(ID, "w_toku");

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.fn).toBe("log_admin_action");
    expect(rpcCalls[0]?.args.p_action).toBe("inquiry.status_change");
    expect(rpcCalls[0]?.args.p_details).toEqual({ to: "w_toku" });
  });

  /** U2: status jest juz zmieniony, wiec cache musi zostac uniewazniony tak czy inaczej. */
  it("uniewaznia cache panelu nawet gdy zapis dziennika sie nie uda", async () => {
    rpcError = { message: "permission denied" };

    await expect(changeInquiryStatus(ID, "w_toku")).rejects.toThrow(
      /dziennik/i,
    );
    expect(updates).toEqual([{ status: "w_toku" }]);
    expect(revalidated).toContain("/panel/zgloszenia");
    expect(revalidated).toContain(`/panel/zgloszenia/${ID}`);
  });

  it("nieudany UPDATE nie zapisuje wpisu w dzienniku", async () => {
    updateError = { message: "trigger rejected" };

    await expect(changeInquiryStatus(ID, "w_toku")).rejects.toThrow(
      "Nie udało się zmienić statusu.",
    );
    expect(rpcCalls).toEqual([]);
  });
});
