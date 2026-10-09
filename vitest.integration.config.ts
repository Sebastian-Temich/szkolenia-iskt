import { defineConfig } from 'vitest/config'

// Konfiguracja testow integracyjnych (Etap 2): RLS i zapis zgloszen na LOKALNYM
// stacku Supabase. Nazwa pliku celowo odrebna od przyszlej konfiguracji testow
// jednostkowych z E1 (vitest.config.ts) — scalenie nastapi w PR E1/E2.
export default defineConfig({
  // Testy integracyjne nie dotykaja CSS; pusta konfiguracja PostCSS wylacza
  // automatyczne wyszukiwanie postcss.config.* (izolacja od warstwy frontendu E1).
  css: { postcss: { plugins: [] } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    globalSetup: ['tests/integration/helpers/global-setup.ts'],
    // Uzytkownicy Auth i dane tworzone sa wspoldzielnie — brak rownoleglosci plikow,
    // zeby testy byly deterministyczne i nie scigaly sie o te same rekordy.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
})
