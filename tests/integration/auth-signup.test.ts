// ISK-362 (E7 W3): utwardzenie konfiguracji Supabase Auth — bramka odbioru.
// Kodyfikuje trzy kryteria z karty board jako jawny, nazwany test:
//   1. Publiczna rejestracja jest ODRZUCANA (anon POST /auth/v1/signup).
//   2. Logowanie istniejacego administratora DZIALA (signInWithPassword).
//   3. Konto testowe utworzone przez admin.createUser (service_role) DZIALA.
//
// Mechanika (Supabase CLI/GoTrue):
//   - Kryt. 1 realizuje GLOBALNY `[auth].enable_signup = false` (GOTRUE_DISABLE_SIGNUP),
//     ktory blokuje POST /auth/v1/signup dla wszystkich providerow.
//   - Kryt. 2 wymaga, zeby provider e-mail pozostal WLACZONY (`[auth.email].enable_signup = true`).
//     Ustawienie `[auth.email].enable_signup = false` przelacza external_email_enabled=false
//     i zwraca `email_provider_disabled` dla signInWithPassword — czyli odcina logowanie takze
//     jedynemu administratorowi (potwierdzone na czystym runnerze CI, commit 701fba5).
//   - Kryt. 3: admin.createUser (service_role) omija GOTRUE_DISABLE_SIGNUP.
import { afterAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, serviceClient, stackEnv } from './helpers/supabase'
import { createClient } from '@supabase/supabase-js'

// Dedykowane adresy (nie koliduja z ADMIN_EMAIL/USER_EMAIL innych plikow przy rownoleglym biegu).
const GUARD_ADMIN_EMAIL = 'signup-guard-admin@example.invalid'
// Haslo spelnia nowy wymog: minimum_password_length=12 + lower_upper_letters_digits_symbols.
const GUARD_ADMIN_PASSWORD = 'Local-Guard-Passphrase-123!'
const noPersist = { auth: { persistSession: false, autoRefreshToken: false } }

const createdUserIds: string[] = []

afterAll(async () => {
  // Sprzatanie — nie zostawiamy kont testowych na wspoldzielonym stacku.
  const admin = serviceClient()
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
})

describe('ISK-362 E7 W3 — utwardzenie Supabase Auth', () => {
  test('kryt.1: publiczna rejestracja przez anon signUp jest odrzucona', async () => {
    const anon = anonClient()
    // Unikalny adres i haslo zgodne z polityka zlozonosci — jedynym powodem odmowy
    // moze byc wylaczona rejestracja, nie slabe haslo.
    const email = `public-signup-${Date.now()}@example.invalid`
    const { data, error } = await anon.auth.signUp({ email, password: GUARD_ADMIN_PASSWORD })

    expect(error, 'otwarta rejestracja musi byc zablokowana (GOTRUE_DISABLE_SIGNUP)').not.toBeNull()
    expect(data.session, 'signUp nie moze zwrocic sesji').toBeNull()
    expect(data.user, 'signUp nie moze utworzyc konta').toBeNull()
    // Powod: rejestracja wylaczona (nie np. slabe haslo).
    const code = (error as { code?: string } | null)?.code
    expect(
      code === 'signup_disabled' || /signup|disabled|not allowed/i.test(error?.message ?? ''),
      `oczekiwano powodu "rejestracja wylaczona", otrzymano: code=${code} message=${error?.message}`,
    ).toBe(true)

    // Jesli jakims cudem konto powstalo — usun je (ochrona wspoldzielonego stacku).
    if (data.user?.id) createdUserIds.push(data.user.id)
  })

  test('kryt.3: admin.createUser (service_role) tworzy konto mimo wylaczonej rejestracji', async () => {
    const admin = serviceClient()
    // Idempotentnie: usun ewentualna pozostalosc po poprzednim biegu.
    const existing = await admin.auth.admin.listUsers()
    const stale = existing.data.users.find((u) => u.email?.toLowerCase() === GUARD_ADMIN_EMAIL)
    if (stale?.id) await admin.auth.admin.deleteUser(stale.id).catch(() => {})

    let userId: string | undefined
    let lastErr: unknown
    for (let attempt = 0; attempt < 5 && !userId; attempt++) {
      const created = await admin.auth.admin.createUser({
        email: GUARD_ADMIN_EMAIL,
        password: GUARD_ADMIN_PASSWORD,
        email_confirm: true,
      })
      userId = created.data.user?.id
      lastErr = created.error
      if (!userId) await new Promise((r) => setTimeout(r, 1000))
    }
    expect(userId, `admin.createUser nie utworzyl konta: ${JSON.stringify(lastErr)}`).toBeTruthy()
    if (userId) createdUserIds.push(userId)
  })

  test('kryt.2: logowanie istniejacego administratora przez signInWithPassword dziala', async () => {
    // Niezaleznie od kolejnosci testow upewnij sie, ze konto istnieje (service_role).
    // Provider e-mail musi byc wlaczony, inaczej signInWithPassword zwroci email_provider_disabled.
    const service = serviceClient()
    const existing = await service.auth.admin.listUsers()
    const already = existing.data.users.find((u) => u.email?.toLowerCase() === GUARD_ADMIN_EMAIL)
    if (!already) {
      const created = await service.auth.admin.createUser({
        email: GUARD_ADMIN_EMAIL,
        password: GUARD_ADMIN_PASSWORD,
        email_confirm: true,
      })
      if (created.data.user?.id) createdUserIds.push(created.data.user.id)
    }

    const { apiUrl, anonKey } = stackEnv()
    const client: SupabaseClient = createClient(apiUrl, anonKey, noPersist)
    const { data, error } = await client.auth.signInWithPassword({
      email: GUARD_ADMIN_EMAIL,
      password: GUARD_ADMIN_PASSWORD,
    })
    expect(
      error,
      `logowanie administratora musi dzialac (provider e-mail wlaczony); blad: ${error?.message} / ${(error as { code?: string } | null)?.code}`,
    ).toBeNull()
    expect(data.session?.access_token, 'oczekiwano waznej sesji administratora').toBeTruthy()
  })
})
