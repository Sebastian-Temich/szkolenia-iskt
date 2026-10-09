import { defineConfig, devices } from "@playwright/test";

// Port jest konfigurowalny, bo kilka worktree tego repozytorium moze pracowac
// rownolegle na jednej maszynie. `reuseExistingServer` jest wylaczone na stale:
// przy wspoldzielonym drzewie "istniejacy serwer" na tym porcie bywa aplikacja
// z innego branchu i testy przechodza albo padaja na obcym kodzie.
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Bramka hermetycznosci (ADR-0005 D7) + lokalne konta testowe. Bez tego
  // wpisu helper istnieje, ale nigdy sie nie wykonuje, a sciezki D5.6/D5.9
  // padaja na brak uzytkownikow — i czyta sie to jak blad logowania.
  globalSetup: "./tests/e2e/helpers/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Serwer e2e dziala w trybie dev, wiec pierwsze wejscie w trase i kazda
  // Server Action placa za kompilacje na zadanie. Domyslne 5 s / 30 s sa na to
  // za ciasne i czytaja sie jak zepsuta aplikacja (patrz ADR-0005 D7).
  timeout: 120_000,
  expect: { timeout: 30_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PLAYWRIGHT_USE_BUILD
      ? `npm run start -- --port ${port}`
      : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
