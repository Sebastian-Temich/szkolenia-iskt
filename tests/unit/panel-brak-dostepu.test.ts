/**
 * ISK-373 / P11 — ekran braku uprawnien nie ujawnia nazw obiektow bazy
 * i wskazuje droge uzyskania dostepu.
 *
 * Pomiar w przegladarce (widocznosc odnosnika, podkreslenie) siedzi
 * w `tests/e2e/ux-powazne.spec.ts`. Ten test pilnuje samej TRESCI, bo to ona
 * byla defektem — i robi to bez stacku Supabase, wiec zlapie regresje nawet
 * wtedy, gdy zestaw e2e nie ma jak sie uruchomic.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

// Strona importuje Server Action `logout`, ktora siega do konfiguracji Supabase.
// W tescie liczy sie tylko wyrenderowana tresc, wiec akcja jest zaslepiona.
vi.mock("@/app/panel/logowanie/actions", () => ({ logout: async () => {} }));

describe("Ekran /panel/brak-dostepu (ISK-373 / P11)", () => {
  async function render(): Promise<string> {
    const { default: ForbiddenPage } =
      await import("@/app/panel/brak-dostepu/page");
    return renderToStaticMarkup(createElement(ForbiddenPage));
  }

  it("nie ujawnia nazwy tabeli ani innych obiektow bazy", async () => {
    const html = await render();
    // Doslownie tak brzmial komunikat: „Administrator musi byc wpisany do
    // rejestru admin_users”.
    expect(html).not.toContain("admin_users");
    for (const name of ["inquiries", "trainings", "trainers", "categories"]) {
      expect(html, `nazwa obiektu bazy w tresci: ${name}`).not.toContain(name);
    }
    // Znacznik `<code>` byl nosnikiem tej nazwy — i nie ma tu nic innego,
    // co wymagaloby czcionki o stalej szerokosci.
    expect(html).not.toContain("<code>");
  });

  it("mowi, do kogo sie zglosic po dostep (kryterium 6 z DoD bramki)", async () => {
    const html = await render();
    expect(html).toContain("mailto:biuro@iskt.pl");
    expect(html).toMatch(/Uprawnienia nadaje administrator ISKT/);
    // Odnosnik musi byc odroznialny od tekstu: regula bazowa zeruje
    // `text-decoration` dla kazdego `a`, wiec potrzebna jest wlasna klasa.
    expect(html).toContain("panel-inline-link");
  });

  it("zostawia wyjscie z sytuacji", async () => {
    const html = await render();
    expect(html).toContain("Wyloguj się");
  });
});
