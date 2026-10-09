// Testy niezmiennikow schematu (model-danych.md sekcja 5).
// Pozytywny: P5 (reset + seed odtworzone). Negatywny: N10 (zadna tabela public bez RLS).
import { describe, expect, test } from 'vitest'
import { serviceClient, withPg } from './helpers/supabase'

const EXPECTED_TABLES = [
  'admin_users',
  'categories',
  'trainers',
  'trainings',
  'training_trainers',
  'inquiries',
  'inquiry_status_history',
  'admin_audit_log',
  'form_submission_throttle',
]

describe('Schemat i niezmienniki bezpieczenstwa', () => {
  test('P5: po db reset seed demonstracyjny jest obecny (schemat odtworzony od zera)', async () => {
    const svc = serviceClient()
    const cats = await svc.from('categories').select('slug').like('name', '[DEMO]%')
    expect(cats.error).toBeNull()
    expect((cats.data ?? []).length).toBeGreaterThanOrEqual(5)

    const trainings = await svc.from('trainings').select('slug').like('title', '[DEMO]%')
    expect((trainings.data ?? []).length).toBeGreaterThanOrEqual(3)

    const trainers = await svc.from('trainers').select('slug').like('full_name', '[DEMO]%')
    expect((trainers.data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  test('P5 (funkcje): wymagane funkcje pomocnicze i utrzymaniowe istnieja', async () => {
    const names = await withPg(async (c) => {
      const r = await c.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname = any($1)`,
        [['is_admin', 'immutable_unaccent', 'set_updated_at', 'enforce_inquiry_admin_update', 'purge_expired_inquiries', 'purge_submission_throttle']],
      )
      return r.rows.map((row: { proname: string }) => row.proname)
    })
    for (const fn of ['is_admin', 'immutable_unaccent', 'set_updated_at', 'enforce_inquiry_admin_update', 'purge_expired_inquiries', 'purge_submission_throttle']) {
      expect(names).toContain(fn)
    }
  })

  test('N10: zadna tabela w schemacie public nie ma wylaczonego RLS', async () => {
    const result = await withPg(async (c) => {
      const disabled = await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false`,
      )
      const all = await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='r'`,
      )
      return {
        disabled: disabled.rows.map((r: { relname: string }) => r.relname),
        all: all.rows.map((r: { relname: string }) => r.relname),
      }
    })
    expect(result.disabled).toEqual([])
    // wszystkie 9 oczekiwanych tabel istnieje i (implicytnie) maja RLS
    for (const t of EXPECTED_TABLES) expect(result.all).toContain(t)
  })
})
