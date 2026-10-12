/**
 * ISK-373 / P18 — degradacja awatara i stan pusty listy trenerow.
 *
 * Dlaczego tutaj, a nie w e2e: seed `[DEMO]` zawsze tworzy dwoje trenerow, wiec
 * stanu pustego nie da sie na dzialajacym stacku zobaczyc bez wycofania ich
 * z publikacji — a to zmiana stanu globalnego, ktora zepsulaby rownolegle testy
 * czytajace `/trenerzy`. Mockujemy wiec warstwe danych i renderujemy sam
 * komponent trasy. Nieudane wczytanie zdjecia (zdarzenie `error` w przegladarce)
 * jest pokryte w `tests/e2e/ux-powazne.spec.ts` — tego nie da sie zmierzyc bez
 * silnika renderujacego.
 *
 * Repozytorium nie ma jsdom ani RTL, a projekt `unit` to `environment: "node"`
 * i tylko pliki `.test.ts` — renderujemy wiec przez `react-dom/server`
 * i asertujemy na napisie HTML. `TrainersPage` jest asynchronicznym komponentem
 * serwerowym, czyli zwykla funkcja async zwracajaca element: najpierw `await`,
 * potem `renderToStaticMarkup`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Trainer } from "@/lib/public-catalog";

const getTrainers = vi.hoisted(() => vi.fn());

vi.mock("@/lib/public-catalog", () => ({ getTrainers }));

// `buildPageMetadata` czyta konfiguracje publiczna, ktorej w tescie nie ma.
vi.mock("@/lib/seo", () => ({ buildPageMetadata: () => ({}) }));

function trainer(overrides: Partial<Trainer> = {}): Trainer {
  return {
    id: `id-${Math.random().toString(16).slice(2)}`,
    slug: "test-trener",
    full_name: "[DEMO] Anna Testowa",
    headline: "Trenerka testowa",
    bio: "Fikcyjny profil.",
    competences: ["Test"],
    photo_url: null,
    ...overrides,
  } as Trainer;
}

async function renderTrainersPage(): Promise<string> {
  const { default: TrainersPage } =
    await import("@/app/(public)/trenerzy/page");
  return renderToStaticMarkup(await TrainersPage());
}

beforeEach(() => {
  getTrainers.mockReset();
});

describe("ISK-373 / P18 — stan pusty listy trenerow", () => {
  it("zero opublikowanych profili daje wyjasnienie i dalszy krok", async () => {
    getTrainers.mockResolvedValue([]);
    const html = await renderTrainersPage();

    // Przed poprawka zostawala goła sekcja — ani slowa wyjasnienia.
    expect(html).toContain("empty-state");
    expect(html).toContain("Lista trenerów jest w przygotowaniu");
    // Stan pusty nie jest zaulkiem: prowadzi do formularza kontaktowego.
    expect(html).toContain('href="/kontakt"');
    // Siatka kart nie jest renderowana na pusto.
    expect(html).not.toContain("trainer-card");
  });

  it("niepusta lista nie pokazuje stanu pustego (kontrapunkt)", async () => {
    getTrainers.mockResolvedValue([trainer()]);
    const html = await renderTrainersPage();

    expect(html).toContain("trainer-card");
    expect(html).not.toContain("empty-state");
    expect(html).not.toContain("Lista trenerów jest w przygotowaniu");
  });
});

describe("ISK-373 / P18 — awatar zawsze ma warstwe zastepcza", () => {
  it("profil ze zdjeciem renderuje inicjaly POD zdjeciem", async () => {
    getTrainers.mockResolvedValue([
      trainer({
        full_name: "[DEMO] Celina Zezdjeciem",
        photo_url: "https://przyklad.example.invalid/zdjecie.png",
      }),
    ]);
    const html = await renderTrainersPage();

    // To jest sedno poprawki: zdjecie i zastepnik nie sa alternatywa. Gdy
    // zasob zwroci 404, przegladarka nic nie rysuje i spod przezroczystego
    // `img` widac inicjaly — bez udzialu JavaScriptu i przed hydratacja.
    expect(html).toContain('data-avatar="photo"');
    expect(html).toContain("avatar-photo");
    expect(html).toContain(">CZ<");
  });

  it("profil bez zdjecia renderuje sam zastepnik", async () => {
    getTrainers.mockResolvedValue([
      trainer({ full_name: "[DEMO] Anna Testowa", photo_url: null }),
    ]);
    const html = await renderTrainersPage();

    expect(html).toContain('data-avatar="initials"');
    expect(html).toContain(">AT<");
    expect(html).not.toContain("avatar-photo");
  });

  it("prefiks [DEMO] nie trafia do inicjalow", async () => {
    getTrainers.mockResolvedValue([
      trainer({ full_name: "[DEMO] Bogdan Zenon Krawiec" }),
    ]);
    const html = await renderTrainersPage();
    // Dwie pierwsze litery nazwiska, nie „[D”.
    expect(html).toContain(">BZ<");
    expect(html).not.toContain(">[D<");
  });
});
