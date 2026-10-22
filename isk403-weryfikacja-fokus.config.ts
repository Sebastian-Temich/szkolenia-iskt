// Tymczasowa konfiguracja ISK-403: sprawdza helper `przejscieFocusem` na
// statycznej probce (file://), bez stacku Supabase i bez webServera.
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/weryfikacja-fokus",
  retries: 0,
  reporter: "list",
  use: { browserName: "chromium" },
});
