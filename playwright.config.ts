import { defineConfig, devices } from "@playwright/test";

// Port jest konfigurowalny, bo kilka worktree tego repozytorium moze pracowac
// rownolegle na jednej maszynie. `reuseExistingServer` jest wylaczone na stale:
// przy wspoldzielonym drzewie "istniejacy serwer" na tym porcie bywa aplikacja
// z innego branchu i testy przechodza albo padaja na obcym kodzie.
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PLAYWRIGHT_USE_BUILD
      ? `npm run start -- --port ${port}`
      : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
