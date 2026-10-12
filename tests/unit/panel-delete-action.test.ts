/**
 * ISK-364 / B6 — dowod braku utraty danych, oraz ISK-374 BL-A / U2 — slad w dzienniku.
 *
 * Test dotyka samej akcji serwerowej, nie UI: okienko potwierdzenia da sie
 * pominac (skrypt, wylaczony JS, recznie zlozone zadanie do Server Action),
 * wiec guard MUSI siedziec po stronie serwera. Asercja nie konczy sie na
 * "rzucilo bledem" — sprawdzamy, ze usuniecie nie zostalo wywolane ANI RAZU
 * i ze akcja nie dotarla nawet do uwierzytelnienia, czyli do klienta bazy.
 *
 * Kontrola negatywna: usuniecie wywolania `isDeleteConfirmed` z
 * `deleteCatalogItem` czerwieni tu testy "bez potwierdzenia…", bo RPC usuwajace
 * zostanie wywolane.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIRM_DELETE_FIELD } from "@/lib/panel/confirm-delete";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

// Bezposrednie `from(table).delete()` NIE powinno sie juz pojawic — usuniecie idzie przez
// RPC, zeby wpis w dzienniku byl czescia tej samej transakcji (U2). Zliczamy je, zeby
// powrot do starej sciezki byl widoczny jako czerwony test, a nie przeoczony.
const tableDeleteCalls: Array<{ table: string; id: string }> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const requireAdmin = vi.fn();
const refreshed = vi.fn();
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/panel/catalog-cache", () => ({
  invalidatePublicCatalog: (...args: unknown[]) => refreshed(...args),
}));

vi.mock("@/lib/panel/auth", () => ({
  requireAdmin: () => {
    requireAdmin();
    return Promise.resolve({
      supabase: {
        from(table: string) {
          return {
            delete() {
              return {
                eq(_column: string, id: string) {
                  tableDeleteCalls.push({ table, id });
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        rpc(fn: string, args: Record<string, unknown>) {
          rpcCalls.push({ fn, args });
          return Promise.resolve(rpcResult);
        },
      },
    });
  },
}));

const { deleteCatalogItem } = await import("@/app/panel/(admin)/actions");

function confirmedForm(id: string): FormData {
  const form = new FormData();
  form.set(CONFIRM_DELETE_FIELD, id);
  return form;
}

/** Wywolania RPC, ktore faktycznie usuwaja — niezaleznie od nazwy funkcji. */
const deleteRpcCalls = () =>
  rpcCalls.filter((call) => call.fn === "delete_catalog_item");

beforeEach(() => {
  tableDeleteCalls.length = 0;
  rpcCalls.length = 0;
  rpcResult = { data: null, error: null };
  requireAdmin.mockClear();
  refreshed.mockClear();
});

describe("deleteCatalogItem — potwierdzenie jest wymagane po stronie serwera", () => {
  it("bez FormData nie usuwa niczego i nie siega do bazy", async () => {
    await expect(deleteCatalogItem("training", ID)).rejects.toThrow(
      "Usunięcie wymaga potwierdzenia.",
    );
    expect(rpcCalls).toEqual([]);
    expect(tableDeleteCalls).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("bez pola potwierdzenia nie usuwa niczego i nie siega do bazy", async () => {
    await expect(
      deleteCatalogItem("training", ID, new FormData()),
    ).rejects.toThrow("Usunięcie wymaga potwierdzenia.");
    expect(rpcCalls).toEqual([]);
    expect(tableDeleteCalls).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("z potwierdzeniem innego wiersza nie usuwa niczego", async () => {
    await expect(
      deleteCatalogItem("training", ID, confirmedForm(OTHER_ID)),
    ).rejects.toThrow("Usunięcie wymaga potwierdzenia.");
    expect(rpcCalls).toEqual([]);
    expect(tableDeleteCalls).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("z poprawnym potwierdzeniem usuwa dokladnie te pozycje", async () => {
    await deleteCatalogItem("training", ID, confirmedForm(ID));
    expect(deleteRpcCalls()).toEqual([
      { fn: "delete_catalog_item", args: { p_kind: "training", p_id: ID } },
    ]);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  /**
   * ISK-374 U2: usuniecie jest nieodwracalne i kaskaduje na przypisania trenerow, a wpis
   * skladany PO commicie nie chronil niczego — gdy zapis dziennika padl, pozycja byla juz
   * usunieta i nadal bez sladu. Dlatego akcja nie moze usuwac tabeli bezposrednio ani
   * dokladac osobnego wywolania dziennika: oba kroki sa w jednej transakcji RPC
   * (dowod atomowosci: tests/integration/panel-audit.test.ts).
   */
  it("usuwa i loguje jedna transakcja, bez osobnego zapytania do tabeli", async () => {
    await deleteCatalogItem("training", ID, confirmedForm(ID));

    expect(tableDeleteCalls).toEqual([]);
    expect(rpcCalls.map((call) => call.fn)).toEqual(["delete_catalog_item"]);
  });

  it("nieudane usuniecie nie konczy sie cichym sukcesem ani uniewaznieniem cache", async () => {
    rpcResult = { data: null, error: { message: "permission denied" } };
    await expect(
      deleteCatalogItem("training", ID, confirmedForm(ID)),
    ).rejects.toThrow(/Nie udało się usunąć pozycji/);
    // Transakcja wycofana — nic nie zostalo usuniete, wiec nie ma czego uniewazniac.
    expect(refreshed).not.toHaveBeenCalled();
  });

  it("guard obowiazuje takze trenerow i kategorie", async () => {
    await expect(deleteCatalogItem("trainer", ID)).rejects.toThrow(
      "Usunięcie wymaga potwierdzenia.",
    );
    await expect(deleteCatalogItem("category", ID)).rejects.toThrow(
      "Usunięcie wymaga potwierdzenia.",
    );
    expect(rpcCalls).toEqual([]);

    await deleteCatalogItem("trainer", ID, confirmedForm(ID));
    await deleteCatalogItem("category", ID, confirmedForm(ID));
    expect(deleteRpcCalls().map((call) => call.args)).toEqual([
      { p_kind: "trainer", p_id: ID },
      { p_kind: "category", p_id: ID },
    ]);
  });

  it("niepoprawny identyfikator odpada przed potwierdzeniem", async () => {
    await expect(
      deleteCatalogItem("training", "nie-uuid", confirmedForm("nie-uuid")),
    ).rejects.toThrow("Niepoprawny identyfikator.");
    expect(rpcCalls).toEqual([]);
  });
});
