/**
 * ISK-374 BL-D i BL-A — kontrakt zapisu szkolenia w Server Action.
 *
 * Test integracyjny (tests/integration/panel-audit.test.ts) dowodzi, że funkcja
 * `set_training_trainers()` jest atomowa. Nie powiedziałby jednak nic, gdyby panel
 * wrócił do dwóch osobnych zapytań (DELETE + INSERT) — a to był właśnie defekt. Dlatego
 * tutaj pilnujemy drugiej połowy: akcja MUSI wymieniać trenerów jednym wywołaniem RPC
 * i nie wolno jej usuwać wierszy `training_trainers` samodzielnie.
 *
 * Kontrola negatywna: zamiana wywołania RPC w `saveTraining` na `delete()` + `insert()`
 * czerwieni test „nie usuwa przypisań osobnym zapytaniem”.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const CATEGORY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TRAINING_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEW_TRAINING_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TRAINER_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TRAINER_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Call = { op: string; table: string; values?: Record<string, unknown> };

const calls: Call[] = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const rpcErrors = new Map<string, { message: string }>();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/panel/catalog-cache", () => ({
  invalidatePublicCatalog: vi.fn(),
}));

vi.mock("@/lib/panel/auth", () => ({
  requireAdmin: () =>
    Promise.resolve({
      supabase: {
        from(table: string) {
          return {
            update(values: Record<string, unknown>) {
              return {
                eq() {
                  calls.push({ op: "update", table, values });
                  return Promise.resolve({ error: null });
                },
              };
            },
            insert(values: Record<string, unknown>) {
              calls.push({ op: "insert", table, values });
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { id: NEW_TRAINING_ID },
                      error: null,
                    }),
                }),
              };
            },
            delete() {
              return {
                eq() {
                  calls.push({ op: "delete", table });
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        rpc(fn: string, args: Record<string, unknown>) {
          rpcCalls.push({ fn, args });
          return Promise.resolve({
            data: null,
            error: rpcErrors.get(fn) ?? null,
          });
        },
      },
    }),
}));

const { saveTraining } = await import("@/app/panel/(admin)/actions");

function trainingForm(
  overrides: Record<string, string> = {},
  trainerIds: string[] = [],
): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    title: "[TEST] Szkolenie",
    slug: "test-szkolenie",
    summary: "Podsumowanie testowe o wystarczającej długości.",
    description: "Opis testowy.",
    category_id: CATEGORY_ID,
    level: "podstawowy",
    duration_hours: "8",
    price_net_pln: "1200",
    sort_order: "100",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  for (const id of trainerIds) form.append("trainer_ids", id);
  return form;
}

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  rpcErrors.clear();
});

describe("saveTraining — wymiana trenerów i dziennik audytu", () => {
  it("wymienia trenerów jednym wywołaniem RPC, z kolejnością z formularza", async () => {
    await saveTraining(
      trainingForm({ id: TRAINING_ID }, [TRAINER_A, TRAINER_B]),
    );

    expect(rpcCalls[0]).toEqual({
      fn: "set_training_trainers",
      args: {
        p_training_id: TRAINING_ID,
        p_trainer_ids: [TRAINER_A, TRAINER_B],
      },
    });
  });

  it("nie usuwa przypisań osobnym zapytaniem (to był defekt BL-D)", async () => {
    await saveTraining(trainingForm({ id: TRAINING_ID }, [TRAINER_A]));

    expect(calls.filter((call) => call.table === "training_trainers")).toEqual(
      [],
    );
    expect(calls.map((call) => `${call.op}:${call.table}`)).toEqual([
      "update:trainings",
    ]);
  });

  it("gdy wymiana trenerów się nie uda, zgłasza błąd i nie zapisuje wpisu audytu", async () => {
    rpcErrors.set("set_training_trainers", { message: "foreign key" });

    await expect(
      saveTraining(trainingForm({ id: TRAINING_ID }, [TRAINER_A])),
    ).rejects.toThrow(/Poprzednie przypisania pozostały/);
    expect(rpcCalls.map((call) => call.fn)).toEqual(["set_training_trainers"]);
  });

  it("zapisuje wpis w dzienniku audytu po udanej edycji", async () => {
    await saveTraining(trainingForm({ id: TRAINING_ID }, [TRAINER_A]));

    expect(rpcCalls[1]).toEqual({
      fn: "log_admin_action",
      args: {
        p_action: "training.update",
        p_entity: "training",
        p_entity_id: TRAINING_ID,
        p_details: { trainers: 1 },
      },
    });
  });

  it("dla nowego szkolenia loguje utworzenie i używa identyfikatora z INSERT-a", async () => {
    await saveTraining(trainingForm({}, [TRAINER_A]));

    expect(calls.map((call) => `${call.op}:${call.table}`)).toEqual([
      "insert:trainings",
    ]);
    expect(rpcCalls).toEqual([
      {
        fn: "set_training_trainers",
        args: { p_training_id: NEW_TRAINING_ID, p_trainer_ids: [TRAINER_A] },
      },
      {
        fn: "log_admin_action",
        args: {
          p_action: "training.create",
          p_entity: "training",
          p_entity_id: NEW_TRAINING_ID,
          p_details: { trainers: 1 },
        },
      },
    ]);
  });

  /** BL-C: pola czytane przez publiczny frontend muszą trafić do zapisu. */
  it("zapisuje is_featured, pola SEO i listę korzyści", async () => {
    const form = trainingForm({ id: TRAINING_ID });
    form.set("is_featured", "on");
    form.set("seo_title", "Tytuł SEO");
    form.set("seo_description", "Opis SEO");
    form.set("learning_outcomes", "Ocena ryzyka\nProcedury kontrolne");
    form.set("target_audience", "Zespoły techniczne");
    form.set("funding_note", "KFS");

    await saveTraining(form);

    expect(calls[0]?.values).toMatchObject({
      is_featured: true,
      seo_title: "Tytuł SEO",
      seo_description: "Opis SEO",
      learning_outcomes: ["Ocena ryzyka", "Procedury kontrolne"],
      target_audience: "Zespoły techniczne",
      funding_note: "KFS",
    });
    // `trainer_ids` nie jest kolumną tabeli `trainings` — idzie wyłącznie do RPC.
    expect(calls[0]?.values).not.toHaveProperty("trainer_ids");
  });

  it("niezaznaczony checkbox zapisuje false, a nie pomija pola", async () => {
    await saveTraining(trainingForm({ id: TRAINING_ID }));

    expect(calls[0]?.values).toMatchObject({
      is_featured: false,
      funding_available: false,
    });
  });
});
