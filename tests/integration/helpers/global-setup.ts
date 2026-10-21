// Global setup testow integracyjnych: po `supabase db reset` kontenery (m.in. GoTrue/auth)
// restartuja sie asynchronicznie. Zanim utworzymy uzytkownikow testowych, czekamy az
// endpoint zdrowia Auth odpowie 200 — eliminuje wyscig (HTTP 502 z bramki) lokalnie i w CI.
import { assertLocalStack, stackEnv } from './supabase'

export default async function setup(): Promise<void> {
  // Bramka hermetycznosci PRZED jakimkolwiek zapytaniem do bazy/API: jesli w srodowisku
  // sa hostowane SUPABASE_* albo rozwiazane parametry nie wskazuja na localhost, przerywamy
  // czytelnym bledem, zanim wyjdzie jakikolwiek request (ADR-0002).
  assertLocalStack()
  const { apiUrl, anonKey } = stackEnv()
  const deadline = Date.now() + 90_000
  let lastStatus = 0
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/auth/v1/health`, { headers: { apikey: anonKey } })
      lastStatus = res.status
      if (res.ok) return
    } catch {
      // kontener jeszcze nie odpowiada — ponawiamy
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Auth (GoTrue) nie wstal w wyznaczonym czasie (ostatni status: ${lastStatus})`)
}
