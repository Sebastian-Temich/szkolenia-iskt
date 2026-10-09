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

export function stackEnv(): StackEnv {
  if (cached) return cached
  const fromProcess = {
    apiUrl: process.env.SUPABASE_URL ?? process.env.API_URL,
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY,
    dbUrl: process.env.SUPABASE_DB_URL ?? process.env.DB_URL,
  }
  if (fromProcess.apiUrl && fromProcess.anonKey && fromProcess.serviceRoleKey && fromProcess.dbUrl) {
    cached = fromProcess as StackEnv
    return cached
  }
  // Fallback: odczyt z CLI uruchomionego stacku.
  const raw = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
  const map = new Map<string, string>()
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) map.set(m[1]!, m[2]!)
  }
  cached = {
    apiUrl: fromProcess.apiUrl ?? map.get('API_URL')!,
    anonKey: fromProcess.anonKey ?? map.get('ANON_KEY')!,
    serviceRoleKey: fromProcess.serviceRoleKey ?? map.get('SERVICE_ROLE_KEY')!,
    dbUrl: fromProcess.dbUrl ?? map.get('DB_URL')!,
  }
  if (!cached.apiUrl || !cached.anonKey || !cached.serviceRoleKey || !cached.dbUrl) {
    throw new Error('Nie udalo sie ustalic parametrow lokalnego stacku Supabase (supabase start?)')
  }
  return cached
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
