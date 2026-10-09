// Pomocnicze funkcje testow integracyjnych.
// Parametry stacku pobieramy dynamicznie z `supabase status -o env`, dzieki czemu
// testy dzialaja niezaleznie od portow w config.toml (lokalnie i w CI). Zadnych
// kluczy w repozytorium — klucze lokalnego stacku sa deterministyczne i czytane w runtime.
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'

type StackEnv = {
  apiUrl: string
  anonKey: string
  serviceRoleKey: string
  dbUrl: string
}

let cached: StackEnv | null = null

// Hosty uznawane za lokalny stack Supabase. Wszystko inne (w szczegolnosci
// `https://<ref>.supabase.co`) jest traktowane jako projekt zdalny/hostowany.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0'])

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    // URL radzi sobie zarowno z http(s):// jak i postgres(ql)://.
    return new URL(url).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

function isLocalUrl(url: string | undefined): boolean {
  const host = hostnameOf(url)
  return host != null && LOCAL_HOSTS.has(host)
}

// Bramka hermetycznosci (krok 1): twardy zakaz hostowanych zmiennych SUPABASE_*.
// Czyta wylacznie `process.env` — nie wykonuje zadnego zapytania do bazy, API ani
// `supabase status`, dzieki czemu moze przerwac przebieg zanim powstanie jakikolwiek
// klient. ADR-0002 i ramy zlecenia zabraniaja dotykania produkcyjnego projektu Supabase.
export function assertNoHostedSupabaseEnv(): void {
  for (const name of ['SUPABASE_URL', 'SUPABASE_DB_URL'] as const) {
    const value = process.env[name]
    if (value && !isLocalUrl(value)) {
      throw new Error(
        `Hermetycznosc testow integracyjnych: ${name}=${value} wskazuje na host inny niz lokalny. ` +
          `npm run test:integration dziala WYLACZNIE przeciw lokalnemu stackowi Supabase (supabase status). ` +
          `Hostowane zmienne SUPABASE_* nie moga byc uzyte — odznacz je w srodowisku ` +
          `(np. uruchom przez scripts/integration-local.sh) i sprobuj ponownie.`,
      )
    }
  }
}

function assertResolvedLocal(env: StackEnv): void {
  if (!isLocalUrl(env.apiUrl)) {
    throw new Error(
      `Hermetycznosc testow integracyjnych: rozwiazane API_URL=${env.apiUrl} nie jest lokalne ` +
        `(oczekiwano 127.0.0.1/localhost). Przerwano przed jakimkolwiek requestem.`,
    )
  }
  if (!isLocalUrl(env.dbUrl)) {
    throw new Error(
      `Hermetycznosc testow integracyjnych: rozwiazane DB_URL wskazuje na host inny niz lokalny ` +
        `(oczekiwano 127.0.0.1/localhost). Przerwano przed jakimkolwiek polaczeniem z baza.`,
    )
  }
}

// Rozwiazuje parametry LOKALNEGO stacku. Pierwszenstwo maja jawnie lokalne zmienne
// API_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL (ustawiane m.in. przez skrypty opakowujace
// i CI z `supabase status`); w braku kompletu czytamy je bezposrednio z `supabase status`.
// Hostowanych SUPABASE_* NIE czytamy w ogole — nie moga trafic do testow przez przypadek.
function resolveLocalEnv(): StackEnv {
  const direct = {
    apiUrl: process.env.API_URL,
    anonKey: process.env.ANON_KEY,
    serviceRoleKey: process.env.SERVICE_ROLE_KEY,
    dbUrl: process.env.DB_URL,
  }
  if (direct.apiUrl && direct.anonKey && direct.serviceRoleKey && direct.dbUrl) {
    return direct as StackEnv
  }
  // Fallback: odczyt z CLI uruchomionego stacku (nie dotyka zadnego zdalnego projektu).
  const raw = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
  const map = new Map<string, string>()
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) map.set(m[1], m[2])
  }
  const resolved = {
    apiUrl: direct.apiUrl ?? map.get('API_URL'),
    anonKey: direct.anonKey ?? map.get('ANON_KEY'),
    serviceRoleKey: direct.serviceRoleKey ?? map.get('SERVICE_ROLE_KEY'),
    dbUrl: direct.dbUrl ?? map.get('DB_URL'),
  }
  if (!resolved.apiUrl || !resolved.anonKey || !resolved.serviceRoleKey || !resolved.dbUrl) {
    throw new Error('Nie udalo sie ustalic parametrow lokalnego stacku Supabase (supabase start?)')
  }
  return resolved as StackEnv
}

export function stackEnv(): StackEnv {
  // Bramka hermetycznosci dziala przy KAZDYM wywolaniu, przed odczytem cache — hostowane
  // SUPABASE_* ustawione pozniej (np. w tescie) tez zostana wychwycone, bez requestu.
  assertNoHostedSupabaseEnv()
  if (cached) return cached
  const resolved = resolveLocalEnv()
  assertResolvedLocal(resolved)
  cached = resolved
  return cached
}

// Pelna bramka hermetycznosci do wywolania na starcie (global-setup) — rzuca, zanim
// powstanie jakikolwiek klient Supabase czy polaczenie z baza.
export function assertLocalStack(): void {
  stackEnv()
}

// Wylacznie na potrzeby testow bramki: zeruje cache, zeby kolejne wywolania ponownie
// rozwiazaly srodowisko.
export function resetStackEnvCache(): void {
  cached = null
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } }

export function anonClient(): SupabaseClient {
  const { apiUrl, anonKey } = stackEnv()
  return createClient(apiUrl, anonKey, noPersist)
}

export function serviceClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = stackEnv()
  return createClient(apiUrl, serviceRoleKey, noPersist)
}

// Tworzy (lub odnajduje) uzytkownika Auth i zwraca zalogowanego klienta w roli `authenticated`.
export async function signedInClient(email: string, password: string): Promise<{ client: SupabaseClient; userId: string }> {
  const admin = serviceClient()
  let userId: string | undefined
  let lastErr: unknown
  // Kilka prob — kontener Auth moze chwilowo zwracac 5xx tuz po restarcie (db reset).
  for (let attempt = 0; attempt < 5 && !userId; attempt++) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    userId = created.data.user?.id
    if (userId) break
    lastErr = created.error
    // Uzytkownik moze juz istniec z poprzedniego przebiegu — odnajdz po adresie.
    const list = await admin.auth.admin.listUsers()
    userId = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
    if (!userId) await new Promise((r) => setTimeout(r, 1000))
  }
  if (!userId) throw new Error(`Nie udalo sie utworzyc/odnalezc uzytkownika ${email}: ${JSON.stringify(lastErr)}`)

  const { apiUrl, anonKey } = stackEnv()
  const client = createClient(apiUrl, anonKey, noPersist)
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { client, userId }
}

export async function grantAdmin(userId: string, label: string): Promise<void> {
  const admin = serviceClient()
  const { error } = await admin.from('admin_users').upsert({ user_id: userId, label }, { onConflict: 'user_id' })
  if (error) throw error
}

// Bezposrednie polaczenie do bazy (rola postgres) do zapytan kontrolnych meta-schematu.
export async function withPg<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: stackEnv().dbUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export const ADMIN_EMAIL = 'admin@example.invalid'
export const ADMIN_PASSWORD = 'local-admin-passphrase-123'
export const USER_EMAIL = 'user@example.invalid'
export const USER_PASSWORD = 'local-user-passphrase-123'
