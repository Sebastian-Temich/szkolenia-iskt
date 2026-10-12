// Bramka hermetycznosci testow integracyjnych (ISK-358 / BLK-1).
// Sprawdza, ze hostowane zmienne SUPABASE_* nie moga skierowac testow na zdalny projekt
// i ze blad pojawia sie ZANIM wyjdzie jakikolwiek request (fetch) lub `supabase status`
// (execFileSync). Test nie wymaga dzialajacego stacku — manipuluje wylacznie process.env.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  assertLocalStack,
  assertNoHostedSupabaseEnv,
  resetStackEnvCache,
} from './helpers/supabase'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => {
    throw new Error('execFileSync nie powinno zostac wywolane, gdy bramka odrzuca hostowane env')
  }),
}))

const HOSTED_URL = 'https://przyklad.supabase.co'
const LOCAL_URL = 'http://127.0.0.1:54321'

const SUPABASE_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'API_URL',
  'ANON_KEY',
  'SERVICE_ROLE_KEY',
  'DB_URL',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const key of SUPABASE_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  resetStackEnvCache()
  vi.clearAllMocks()
})

afterEach(() => {
  for (const key of SUPABASE_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  resetStackEnvCache()
  vi.restoreAllMocks()
})

describe('assertNoHostedSupabaseEnv', () => {
  it('odrzuca hostowane SUPABASE_URL', () => {
    process.env.SUPABASE_URL = HOSTED_URL
    expect(() => assertNoHostedSupabaseEnv()).toThrowError(/Hermetycznosc/)
  })

  it('odrzuca hostowane SUPABASE_DB_URL', () => {
    process.env.SUPABASE_DB_URL = 'postgresql://postgres:x@db.przyklad.supabase.co:5432/postgres'
    expect(() => assertNoHostedSupabaseEnv()).toThrowError(/Hermetycznosc/)
  })

  it('toleruje samodzielny SUPABASE_SERVICE_ROLE_KEY (CI eksportuje lokalny klucz)', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'lokalny-klucz'
    process.env.SUPABASE_ANON_KEY = 'lokalny-anon'
    expect(() => assertNoHostedSupabaseEnv()).not.toThrow()
  })

  it('toleruje lokalne SUPABASE_URL (127.0.0.1)', () => {
    process.env.SUPABASE_URL = LOCAL_URL
    expect(() => assertNoHostedSupabaseEnv()).not.toThrow()
  })
})

describe('assertLocalStack z hostowanym SUPABASE_URL', () => {
  it('rzuca czytelny blad bez requestu i bez `supabase status`', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    process.env.SUPABASE_URL = HOSTED_URL
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cokolwiek'

    expect(() => assertLocalStack()).toThrowError(/Hermetycznosc/)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
  })
})
