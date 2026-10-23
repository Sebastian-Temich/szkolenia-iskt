/**
 * ISK-399 / F8 — jedno zrodlo inicjalow trenera.
 *
 * Defekt: `/panel/trenerzy` liczylo skrot wlasna kopia funkcji, ktora NIE
 * zdejmowala prefiksu `[DEMO]`/`[TEST]`, wiec ten sam czlowiek mial „DJ"
 * w panelu i „JP" na stronie publicznej.
 *
 * Dlaczego ten test wyglada tak, a nie inaczej: dotychczasowe pokrycie
 * (`tests/unit/trenerzy-widok.test.ts`, `tests/e2e/ux-powazne.spec.ts`)
 * sprawdzalo w panelu wylacznie atrybut `data-avatar="initials"`, czyli FAKT
 * istnienia krazka. Rozejscie TRESCI przechodzilo przez taka bramke na
 * zielono. Dlatego asercje ida na glify i — co wazniejsze — porownuja oba
 * widoki miedzy soba: gdyby ktos w przyszlosci znow wprowadzil druga
 * implementacje, rowna tej pierwszej w dniu wprowadzenia, test nadal pilnuje
 * tej samej wlasnosci (identyczny skrot), a nie konkretnej liczby plikow.
 *
 * Renderujemy przez `react-dom/server` do napisu HTML, bo projekt `unit` to
 * `environment: "node"` bez jsdom i RTL (ten sam uklad, co w
 * `trenerzy-widok.test.ts`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trainerInitials } from "@/lib/format";
import type { Trainer } from "@/lib/public-catalog";

const getTrainers = vi.hoisted(() => vi.fn());
const requireAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public-catalog", () => ({ getTrainers }));
vi.mock("@/lib/seo", () => ({ buildPageMetadata: () => ({}) }));
vi.mock("@/lib/panel/auth", () => ({ requireAdmin }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
// Server Actions wiersza siegaja do Supabase i `next/cache`; w tescie liczy
// sie sama tresc krazka, wiec akcje sa zaslepione.
vi.mock("@/app/panel/(admin)/actions", () => ({
  deleteCatalogItem: async () => {},
  setPublished: async () => {},
}));

function trainer(fullName: string): Trainer {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "test-trener",
    full_name: fullName,
    headline: "Trenerka testowa",
    bio: "Fikcyjny profil.",
    competences: ["Test"],
    photo_url: null,
    is_published: true,
    sort_order: 1,
  } as unknown as Trainer;
}

/** Strona publiczna `/trenerzy` — krazek rysuje `TrainerAvatar`. */
async function renderPublicPage(fullName: string): Promise<string> {
  getTrainers.mockResolvedValue([trainer(fullName)]);
  const { default: PublicTrainersPage } =
    await import("@/app/(public)/trenerzy/page");
  return renderToStaticMarkup(await PublicTrainersPage());
}

/** Panel `/panel/trenerzy` — krazek rysuje `IconChip` w komorce tabeli. */
async function renderPanelPage(fullName: string): Promise<string> {
  requireAdmin.mockResolvedValue({
    supabase: {
      from: () => ({
        select: () => ({
          order: async () => ({ data: [trainer(fullName)], error: null }),
        }),
      }),
    },
  });
  const { default: PanelTrainersPage } =
    await import("@/app/panel/(admin)/trenerzy/page");
  return renderToStaticMarkup(
    await PanelTrainersPage({ searchParams: Promise.resolve({}) }),
  );
}

/**
 * Glify krazka. W obu widokach skrot jest JEDYNA trescia swojego elementu,
 * wiec wyciagamy go wzorcem `>XX<` i nie zakladamy, ktora to klasa CSS —
 * inaczej test pekalby przy zmianie szablonu, a nie przy zmianie skrotu.
 */
function circleGlyphs(html: string, fullName: string): string[] {
  const letters = new Set(
    fullName
      .replace(/[^\p{L}]/gu, "")
      .toUpperCase()
      .split(""),
  );
  return [...html.matchAll(/>([^<>]{2})</g)]
    .map(([, text]) => text ?? "")
    .filter((text) => [...text].every((char) => letters.has(char)));
}

beforeEach(() => {
  getTrainers.mockReset();
  requireAdmin.mockReset();
});

describe("ISK-399 / F8 — inicjaly trenera maja jedno zrodlo", () => {
  // Nazwy z `supabase/seed.sql` — na nich defekt byl widoczny w panelu.
  const nazwy = [
    { full_name: "[DEMO] Jan Przykladowy", skrot: "JP" },
    { full_name: "[DEMO] Anna Testowa", skrot: "AT" },
    { full_name: "[TEST] Celina Zezdjeciem", skrot: "CZ" },
    { full_name: "Bogdan Zenon Krawiec", skrot: "BZ" },
  ];

  for (const { full_name, skrot } of nazwy) {
    it(`„${full_name}" daje ten sam skrot w panelu i publicznie: ${skrot}`, async () => {
      const panel = await renderPanelPage(full_name);
      const publiczna = await renderPublicPage(full_name);

      // 1. Oba widoki pokazuja oczekiwany skrot — asercja na GLIFACH.
      expect(panel, "panel").toContain(`>${skrot}<`);
      expect(publiczna, "strona publiczna").toContain(`>${skrot}<`);

      // 2. Zadnego innego dwuliterowego skrotu w krazku nie ma. Bez tego
      //    asercja z punktu 1 nie wyklucza, ze obok poprawnego krazka wisi
      //    drugi, bledny — a przed poprawka w panelu bylo tam „DJ".
      expect(circleGlyphs(panel, full_name), "panel").toEqual([skrot]);
      expect(circleGlyphs(publiczna, full_name), "strona publiczna").toEqual([
        skrot,
      ]);
    });
  }

  it("prefiks danych demonstracyjnych nie wnosi litery do skrotu", async () => {
    // Doslownie to bylo zle: token `[DEMO]` dawal `D` jako pierwsza litere.
    expect(trainerInitials("[DEMO] Jan Przykladowy")).toBe("JP");
    expect(trainerInitials("[DEMO] Jan Przykladowy")).not.toBe("DJ");
    expect(trainerInitials("[TEST] Anna Testowa")).not.toBe("TA");
    // Prefiks moze stac w innym miejscu albo wystapic dwa razy — `replace`
    // bez flagi `g` zdejmowal tylko pierwsze wystapienie.
    expect(trainerInitials("[DEMO] [TEST] Anna Testowa")).toBe("AT");
  });

  it("skrot jest zawsze wielkimi literami i ma zastepnik", async () => {
    // Tytul naukowy liczy sie do skrotu (wzorzec nie zna listy tytulow),
    // ale malej litery na krazku nie pokazujemy.
    expect(trainerInitials("dr Anna Nowak")).toBe("DA");
    // Nazwa bez ani jednej litery nie moze dac pustego krazka.
    expect(trainerInitials("[DEMO] 123")).toBe("?");
    expect(trainerInitials("")).toBe("?");
    // Znak interpunkcyjny nie zajmuje miejsca litery: „J.P." to nadal „JP".
    expect(trainerInitials("Jan-Maria Przykladowy")).toBe("JP");
  });
});
