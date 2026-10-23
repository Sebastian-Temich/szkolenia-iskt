/**
 * ISK-374 BL-D / U1 / BL-A — kontrakt zapisu szkolenia w Server Action.
 *
 * Testy integracyjne (tests/integration/panel-audit.test.ts) dowodza, ze `save_training()`
 * jest atomowa i ze wpis w dzienniku powstaje w tej samej transakcji. Nie powiedzialyby
 * jednak nic, gdyby panel wrocil do skladania zapisu z kilku zapytan REST — a to byl
 * wlasnie defekt (najpierw DELETE+INSERT trenerow, potem `update trainings` + osobne RPC).
 * Dlatego tutaj pilnujemy drugiej polowy dowodu: akcja MUSI zapisywac szkolenie JEDNYM
 * wywolaniem RPC i nie wolno jej samodzielnie dotykac tabel `trainings`/`training_trainers`
 * ani dokladac osobnego wpisu do dziennika.
 *
 * Kontrola negatywna: rozbicie `save_training` w akcji na `update trainings` + RPC
 * `set_training_trainers` + `log_admin_action` czerwieni testy „jednym wywolaniem RPC"
 * i „nie zapisuje szkolenia osobnymi zapytaniami".
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
const refreshed = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// ISK-414: udany zapis wystawia bilet paska potwierdzenia w ciasteczku
// `panel_flash` (kontrakt biletu ma wlasne testy w `panel-flash` i
// `panel-inquiry-note-action`). Tutaj wystarczy atrapa magazynu ciasteczek —
// bez niej `cookies()` leci poza zakresem zadania i caly plik pada na wywolaniu
// akcji, a nie na jej kontrakcie.
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: vi.fn(), get: vi.fn() }),
}));

vi.mock("@/lib/panel/catalog-cache", () => ({
  invalidatePublicCatalog: (...args: unknown[]) => refreshed(...args),
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
          const error = rpcErrors.get(fn) ?? null;
          // `save_training` zwraca identyfikator zapisanego wiersza.
          const data = error
            ? null
            : fn === "save_training"
              ? ((args.p_training_id as string | null) ?? NEW_TRAINING_ID)
              : null;
          return Promise.resolve({ data, error });
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
  refreshed.mockClear();
});

describe("saveTraining — atomowy zapis, trenerzy i dziennik audytu", () => {
  it("zapisuje szkolenie jednym wywolaniem RPC, z kolejnoscia trenerow z formularza", async () => {
    await saveTraining(
      trainingForm({ id: TRAINING_ID }, [TRAINER_A, TRAINER_B]),
    );

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.fn).toBe("save_training");
    expect(rpcCalls[0]?.args.p_training_id).toBe(TRAINING_ID);
    expect(rpcCalls[0]?.args.p_trainer_ids).toEqual([TRAINER_A, TRAINER_B]);
  });

  /**
   * U1: przed poprawka zapis szedl dwoma zapytaniami (wiersz `trainings`, potem RPC na
   * trenerow) i rozjezdzal sie w polowie. Tutaj pilnujemy, ze akcja nie dotyka tabel
   * bezposrednio — ani `trainings`, ani `training_trainers`.
   */
  it("nie zapisuje szkolenia osobnymi zapytaniami (to byly defekty BL-D i U1)", async () => {
    await saveTraining(trainingForm({ id: TRAINING_ID }, [TRAINER_A]));

    expect(calls).toEqual([]);
  });

  /** BL-A/U1: wpis w dzienniku jest czescia transakcji RPC, a nie osobnym wywolaniem. */
  it("nie dokłada osobnego wywołania dziennika — audyt jest w tej samej transakcji", async () => {
    await saveTraining(trainingForm({ id: TRAINING_ID }, [TRAINER_A]));

    expect(rpcCalls.map((call) => call.fn)).toEqual(["save_training"]);
  });

  it("gdy zapis sie nie uda, zglasza blad i nie uniewaznia cache", async () => {
    rpcErrors.set("save_training", { message: "foreign key" });

    await expect(
      saveTraining(trainingForm({ id: TRAINING_ID }, [TRAINER_A])),
    ).rejects.toThrow(/Żadna zmiana nie została wprowadzona/);
    // Nic sie nie zapisalo (transakcja wycofana), wiec nie ma czego uniewazniac.
    expect(refreshed).not.toHaveBeenCalled();
  });

  it("dla nowego szkolenia nie przekazuje identyfikatora i uzywa tego z RPC", async () => {
    await saveTraining(trainingForm({}, [TRAINER_A]));

    expect(calls).toEqual([]);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.args.p_training_id).toBeNull();
    expect(rpcCalls[0]?.args.p_trainer_ids).toEqual([TRAINER_A]);
  });

  /** BL-C: pola czytane przez publiczny frontend musza trafic do zapisu. */
  it("zapisuje is_featured, pola SEO i listę korzyści", async () => {
    const form = trainingForm({ id: TRAINING_ID });
    form.set("is_featured", "on");
    form.set("seo_title", "Tytuł SEO");
    form.set("seo_description", "Opis SEO");
    form.set("learning_outcomes", "Ocena ryzyka\nProcedury kontrolne");
    form.set("target_audience", "Zespoły techniczne");
    form.set("funding_note", "KFS");

    await saveTraining(form);

    expect(rpcCalls[0]?.args.p_training).toMatchObject({
      is_featured: true,
      seo_title: "Tytuł SEO",
      seo_description: "Opis SEO",
      learning_outcomes: ["Ocena ryzyka", "Procedury kontrolne"],
      target_audience: "Zespoły techniczne",
      funding_note: "KFS",
    });
    // `trainer_ids` nie jest kolumną tabeli `trainings` — idzie osobnym argumentem RPC.
    expect(rpcCalls[0]?.args.p_training).not.toHaveProperty("trainer_ids");
    // Publikacja ma wlasna sciezke (setPublished) — formularz edycji nie moze jej ustawic.
    expect(rpcCalls[0]?.args.p_training).not.toHaveProperty("is_published");
  });

  it("niezaznaczony checkbox zapisuje false, a nie pomija pola", async () => {
    await saveTraining(trainingForm({ id: TRAINING_ID }));

    expect(rpcCalls[0]?.args.p_training).toMatchObject({
      is_featured: false,
      funding_available: false,
    });
  });
});
