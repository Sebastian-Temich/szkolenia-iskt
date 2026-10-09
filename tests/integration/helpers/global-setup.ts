// Global setup testow integracyjnych: po `supabase db reset` kontenery (m.in. GoTrue/auth)
// restartuja sie asynchronicznie. Zanim utworzymy uzytkownikow testowych, czekamy az
// endpoint zdrowia Auth odpowie 200 — eliminuje wyscig (HTTP 502 z bramki) lokalnie i w CI.
import { stackEnv } from './supabase'

export default async function setup(): Promise<void> {
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
