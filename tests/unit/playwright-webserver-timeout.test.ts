// Bramka na pulapke ISK-369: `webServer.timeout` w `playwright.config.ts`.
//
// Bez tego wpisu obowiazuje domyslne 60 s Playwrighta. `next dev` na maszynie
// z kilkoma worktree i kilkoma stackami Supabase nie zdazy wstac, a caly
// przebieg konczy sie komunikatem `Timed out waiting 60000ms from
// config.webServer` — czyta sie to jak awaria aplikacji, a jest brakiem
// zasobow. W CI (czysty runner, `PLAYWRIGHT_USE_BUILD=1`) objaw nie wystepuje,
// wiec bramka go nie zglosi; dlatego pilnuje go test jednostkowy.
import type { PlaywrightTestConfig } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import config from "../../playwright.config";

function firstWebServer(value: PlaywrightTestConfig["webServer"]) {
  const server = Array.isArray(value) ? value[0] : value;
  if (!server) {
    throw new Error("playwright.config.ts nie definiuje wpisu webServer");
  }
  return server;
}

describe("playwright.config.ts — webServer", () => {
  it("daje serwerowi wyraznie wiecej niz domyslne 60 s na wstanie", () => {
    expect(firstWebServer(config.webServer).timeout).toBeGreaterThanOrEqual(
      120_000,
    );
  });

  it("pozwala podniesc limit zmienna srodowiskowa bez edycji konfiguracji", async () => {
    const previous = process.env.E2E_WEBSERVER_TIMEOUT_MS;
    process.env.E2E_WEBSERVER_TIMEOUT_MS = "600000";
    try {
      vi.resetModules();
      const reloaded = await import("../../playwright.config");
      expect(firstWebServer(reloaded.default.webServer).timeout).toBe(600_000);
    } finally {
      if (previous === undefined) {
        delete process.env.E2E_WEBSERVER_TIMEOUT_MS;
      } else {
        process.env.E2E_WEBSERVER_TIMEOUT_MS = previous;
      }
    }
  });
});
