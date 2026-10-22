/**
 * ISK-414 — `saveInquiryNote` nie miga sukcesem, gdy nic nie zapisala.
 *
 * Akcja doszla w ISK-402 i nie miala zadnego testu jednostkowego, choc kazda
 * sasiadujaca akcja panelu go ma. Przeglad M4b wskazal w niej dwa defekty tej
 * samej klasy „cichy sukces":
 *
 *  1. ZERO ZAKTUALIZOWANYCH WIERSZY BYLO SUKCESEM. `.update().eq()` wraca
 *     z `error === null` takze wtedy, gdy RLS odfiltrowal wiersz (RLS filtruje
 *     UPDATE jak WHERE) — akcja dopisywala wtedy wpis audytu `inquiry.note_update`
 *     i pokazywala banner „Zapisano notatkę". Projekt zamknal te klase juz dla
 *     usuwania (`delete_catalog_item`); tutaj brakowalo tego samego.
 *  2. BRAK POLA CZYSCIL NOTATKE. `formData.get("admin_note") ?? ""` sprowadzalo
 *     „pola nie ma" i „pole jest puste" do jednego przypadku, wiec powtorzone
 *     albo obciete zadanie kasowalo istniejaca notatke i logowalo `cleared: true`.
 *
 * Kontrola negatywna: powrot do `.update().eq()` bez `.select("id").single()`
 * czerwieni „RLS odfiltrowal wiersz…", a powrot do `?? ""` — „bez pola…".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FLASH_COOKIE, FLASH_PARAM, flashMessage } from "@/lib/panel/flash";

const ID = "44444444-4444-4444-8444-444444444444";

type Result = {
  data: { id: string } | null;
  error: { message: string } | null;
};

let updateResult: Result = { data: { id: ID }, error: null };
let rpcError: { message: string } | null = null;

const updates: Array<{
  table: string;
  values: Record<string, unknown>;
  id: string;
}> = [];
const selects: string[] = [];
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const revalidated: string[] = [];
const redirects: string[] = [];
const cookieJar = new Map<string, { value: string; options: unknown }>();
const requireAdmin = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path);
  },
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirects.push(url);
  },
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: (name: string, value: string, options: unknown) => {
        cookieJar.set(name, { value, options });
      },
      get: (name: string) => {
        const entry = cookieJar.get(name);
        return entry ? { name, value: entry.value } : undefined;
      },
    }),
}));

vi.mock("@/lib/panel/catalog-cache", () => ({
  invalidatePublicCatalog: vi.fn(),
}));

vi.mock("@/lib/panel/auth", () => ({
  requireAdmin: () => {
    requireAdmin();
    return Promise.resolve({
      supabase: {
        from(table: string) {
          return {
            update: (values: Record<string, unknown>) => ({
              eq: (_column: string, id: string) => ({
                select: (columns: string) => {
                  selects.push(columns);
                  return {
                    single: () => {
                      updates.push({ table, values, id });
                      return Promise.resolve(updateResult);
                    },
                  };
                },
                // Stara, cicha sciezka. Gdyby akcja do niej wrocila, testy
                // „RLS odfiltrowal wiersz" musza zobaczyc sukces i upasc —
                // dlatego atrapa jej nie usuwa, tylko zlicza.
                then: (resolve: (value: { error: null }) => unknown) => {
                  updates.push({ table, values, id });
                  return Promise.resolve(resolve({ error: null }));
                },
              }),
            }),
          };
        },
        rpc(fn: string, args: Record<string, unknown>) {
          rpcCalls.push({ fn, args });
          return Promise.resolve({ data: 1, error: rpcError });
        },
      },
    });
  },
}));

const { saveInquiryNote } = await import("@/app/panel/(admin)/actions");

function noteForm(value?: string): FormData {
  const form = new FormData();
  if (value !== undefined) form.set("admin_note", value);
  return form;
}

const auditCalls = () =>
  rpcCalls.filter((call) => call.fn === "log_admin_action");

beforeEach(() => {
  updateResult = { data: { id: ID }, error: null };
  rpcError = null;
  updates.length = 0;
  selects.length = 0;
  rpcCalls.length = 0;
  revalidated.length = 0;
  redirects.length = 0;
  cookieJar.clear();
  requireAdmin.mockClear();
});

describe("saveInquiryNote — zapis notatki wewnetrznej", () => {
  it("zapisuje tresc wylacznie w kolumnie admin_note i loguje operacje", async () => {
    await saveInquiryNote(ID, noteForm("  Kontakt po 15:00  "));

    // Granica uprawnien: grant kolumnowy dopuszcza tylko `(status, admin_note)`.
    expect(updates).toEqual([
      {
        table: "inquiries",
        values: { admin_note: "Kontakt po 15:00" },
        id: ID,
      },
    ]);
    expect(auditCalls()).toEqual([
      {
        fn: "log_admin_action",
        args: {
          p_action: "inquiry.note_update",
          p_entity: "inquiry",
          p_entity_id: ID,
          p_details: { cleared: false },
        },
      },
    ]);
    // Dziennik nie nosi tresci notatki (notatka opisuje osobe zglaszajaca).
    expect(JSON.stringify(auditCalls())).not.toContain("Kontakt po 15:00");
    expect(revalidated).toContain(`/panel/zgloszenia/${ID}`);
  });

  it("puste pole czysci notatke do NULL i zapisuje to w dzienniku", async () => {
    await saveInquiryNote(ID, noteForm(""));

    expect(updates[0]?.values).toEqual({ admin_note: null });
    expect(auditCalls()[0]?.args.p_details).toEqual({ cleared: true });
  });

  /**
   * Defekt 2: „pola nie ma" to nie „wyczysc notatke". Wyczyszczenie ma byc
   * decyzja administratora, a nie skutkiem obcietego albo powtorzonego zadania.
   */
  it("bez pola `admin_note` nie zapisuje NICZEGO i nie siega do bazy", async () => {
    await expect(saveInquiryNote(ID, new FormData())).rejects.toThrow(
      "Brak treści notatki w żądaniu.",
    );

    expect(updates).toEqual([]);
    expect(auditCalls()).toEqual([]);
    expect(redirects).toEqual([]);
    expect(cookieJar.size).toBe(0);
    // Odpada przed uwierzytelnieniem, czyli przed klientem bazy.
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("pole o niepoprawnym typie (plik zamiast tekstu) tez odpada", async () => {
    const form = new FormData();
    form.set("admin_note", new Blob(["notatka"]), "notatka.txt");

    await expect(saveInquiryNote(ID, form)).rejects.toThrow(
      "Brak treści notatki w żądaniu.",
    );
    expect(updates).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  /**
   * Defekt 1 — SEDNO KARTY. Zapis, ktory nie objal zadnego wiersza (cudze
   * zgloszenie, pozycja usunieta w innej karcie), musi byc bledem: bez wpisu
   * audytu, bez przekierowania i bez biletu bannera.
   */
  it("RLS odfiltrowal wiersz — zero zaktualizowanych wierszy jest bledem", async () => {
    updateResult = {
      data: null,
      // Tak wyglada `single()` nad pustym wynikiem w PostgREST.
      error: {
        message: "JSON object requested, multiple (or no) rows returned",
      },
    };

    await expect(saveInquiryNote(ID, noteForm("Notatka"))).rejects.toThrow(
      /Żadna zmiana nie została wprowadzona/,
    );

    expect(auditCalls()).toEqual([]);
    expect(redirects).toEqual([]);
    expect(cookieJar.size).toBe(0);
    expect(revalidated).toEqual([]);
  });

  it('zapis przez `.select("id").single()`, a nie przez cichy `.update().eq()`', async () => {
    await saveInquiryNote(ID, noteForm("Notatka"));

    expect(selects).toEqual(["id"]);
  });

  it("notatka dluzsza niz limit bazy odpada z komunikatem formularza", async () => {
    await expect(
      saveInquiryNote(ID, noteForm("x".repeat(2001))),
    ).rejects.toThrow("Notatka może mieć najwyżej 2000 znaków.");

    expect(updates).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("niepoprawny identyfikator odpada przed czymkolwiek innym", async () => {
    await expect(
      saveInquiryNote("nie-uuid", noteForm("Notatka")),
    ).rejects.toThrow("Niepoprawny identyfikator.");

    expect(updates).toEqual([]);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("nieudany dziennik jest glosny i nie przekierowuje na banner sukcesu", async () => {
    rpcError = { message: "permission denied" };

    await expect(saveInquiryNote(ID, noteForm("Notatka"))).rejects.toThrow(
      /dziennik/i,
    );
    expect(redirects).toEqual([]);
    expect(cookieJar.size).toBe(0);
  });

  /**
   * Bilet bannera: ciasteczko i adres musza zgadzac sie ze soba, bo
   * `flashMessage` wymaga OBU. Przepuszczamy je przez prawdziwa funkcje —
   * test nie zgaduje formatu, tylko sprawdza, ze strona pokaze komunikat.
   */
  it("po udanym zapisie wystawia bilet, ktory `flashMessage` przyjmuje", async () => {
    await saveInquiryNote(ID, noteForm("Notatka"));

    expect(redirects).toHaveLength(1);
    const url = new URL(redirects[0]!, "http://localhost");
    expect(url.pathname).toBe(`/panel/zgloszenia/${ID}`);

    const cookie = cookieJar.get(FLASH_COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true, path: "/panel" });
    expect(
      flashMessage(
        url.searchParams.get(FLASH_PARAM) ?? undefined,
        cookie?.value,
      ),
    ).toBe("Zapisano notatkę wewnętrzną.");

    // Sam adres, bez ciasteczka, nie pokazuje nic (CR-I8).
    expect(
      flashMessage(url.searchParams.get(FLASH_PARAM) ?? undefined, undefined),
    ).toBeNull();
  });
});
