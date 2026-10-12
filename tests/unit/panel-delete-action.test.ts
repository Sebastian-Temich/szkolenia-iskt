/**
 * ISK-364 / B6 — dowod braku utraty danych.
 *
 * Test dotyka samej akcji serwerowej, nie UI: okienko potwierdzenia da sie
 * pominac (skrypt, wylaczony JS, recznie zlozone zadanie do Server Action),
 * wiec guard MUSI siedziec po stronie serwera. Asercja nie konczy sie na
 * "rzucilo bledem" — sprawdzamy, ze `.delete()` nie zostalo wywolane ANI RAZU
 * i ze akcja nie dotarla nawet do uwierzytelnienia, czyli do klienta bazy.
 *
 * Kontrola negatywna: usuniecie wywolania `isDeleteConfirmed` z
 * `deleteCatalogItem` czerwieni tu testy "bez potwierdzenia…", bo `.delete()`
 * zostanie wywolane.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIRM_DELETE_FIELD } from "@/lib/panel/confirm-delete";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const deleteCalls: Array<{ table: string; id: string }> = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const requireAdmin = vi.fn();
const refreshed = vi.fn();
// ISK-374 BL-A: zapis dziennika audytu idzie przez RPC `log_admin_action`.
// Zmienna pozwala sprawdzic rowniez sciezke bledu dziennika.
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: 1,
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
                  deleteCalls.push({ table, id });
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

beforeEach(() => {
  deleteCalls.length = 0;
  rpcCalls.length = 0;
  rpcResult = { data: 1, error: null };
  requireAdmin.mockClear();
  refreshed.mockClear();
});

describe("deleteCatalogItem — potwierdzenie jest wymagane po stronie serwera", () => {
  it("bez FormData nie usuwa niczego i nie siega do bazy", async () => {
    await expect(deleteCatalogItem("training", ID)).rejects.toThrow(
      "Usunięcie wymaga potwierdzenia.",
    );
    expect(deleteCalls).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("bez pola potwierdzenia nie usuwa niczego i nie siega do bazy", async () => {
    await expect(
      deleteCatalogItem("training", ID, new FormData()),
    ).rejects.toThrow("Usunięcie wymaga potwierdzenia.");
    expect(deleteCalls).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("z potwierdzeniem innego wiersza nie usuwa niczego", async () => {
    await expect(
      deleteCatalogItem("training", ID, confirmedForm(OTHER_ID)),
    ).rejects.toThrow("Usunięcie wymaga potwierdzenia.");
    expect(deleteCalls).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("z poprawnym potwierdzeniem usuwa dokladnie te pozycje", async () => {
    await deleteCatalogItem("training", ID, confirmedForm(ID));
    expect(deleteCalls).toEqual([{ table: "trainings", id: ID }]);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  /**
   * ISK-374 BL-A: usuniecie jest nieodwracalne i kaskaduje na przypisania trenerow,
   * wiec bez wpisu w dzienniku nie da sie ustalic kto i kiedy. Asercja pilnuje
   * dokladnej tresci wpisu, zeby nie dalo sie jej "spelnic" pustym wywolaniem.
   */
  it("po usunieciu zapisuje wpis w dzienniku audytu", async () => {
    await deleteCatalogItem("training", ID, confirmedForm(ID));
    expect(rpcCalls).toEqual([
      {
        fn: "log_admin_action",
        args: {
          p_action: "training.delete",
          p_entity: "training",
          p_entity_id: ID,
          p_details: {},
        },
      },
    ]);
  });

  it("nieudany zapis dziennika nie konczy sie cichym sukcesem", async () => {
    rpcResult = { data: null, error: { message: "permission denied" } };
    await expect(
      deleteCatalogItem("training", ID, confirmedForm(ID)),
    ).rejects.toThrow(/dziennik/i);
    // Operacja juz sie wykonala — chodzi o to, by administrator o braku wpisu wiedzial.
    expect(deleteCalls).toEqual([{ table: "trainings", id: ID }]);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it("guard obowiazuje takze trenerow i kategorie", async () => {
    await expect(deleteCatalogItem("trainer", ID)).rejects.toThrow(
      "Usunięcie wymaga potwierdzenia.",
    );
    await expect(deleteCatalogItem("category", ID)).rejects.toThrow(
      "Usunięcie wymaga potwierdzenia.",
    );
    expect(deleteCalls).toEqual([]);

    await deleteCatalogItem("trainer", ID, confirmedForm(ID));
    await deleteCatalogItem("category", ID, confirmedForm(ID));
    expect(deleteCalls).toEqual([
      { table: "trainers", id: ID },
      { table: "categories", id: ID },
    ]);
  });

  it("niepoprawny identyfikator odpada przed potwierdzeniem", async () => {
    await expect(
      deleteCatalogItem("training", "nie-uuid", confirmedForm("nie-uuid")),
    ).rejects.toThrow("Niepoprawny identyfikator.");
    expect(deleteCalls).toEqual([]);
  });
});
