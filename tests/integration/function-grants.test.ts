// Testy uprawnien EXECUTE na funkcjach schematu public (ISK-356).
// Istniejace testy RLS pilnuja TABEL (revoke/grant + polityki). Ta klasa bledu dotyczyla
// FUNKCJI: PostgreSQL nadaje kazdej nowej funkcji domyslny `EXECUTE TO PUBLIC`, przez co
// SECURITY DEFINER purge_* byly wywolywalne przez anon jako RPC PostgREST.
//
// Bramka regresyjna: ZADNA funkcja projektu (nie-rozszerzeniowa) w schemacie public nie moze
// byc wykonywalna przez role anon. Test czerwienieje przy KAZDEJ nowej funkcji, ktora
// odziedziczy domyslny grant PUBLIC — niezaleznie od jej nazwy.
import { describe, expect, test } from 'vitest'
import { withPg } from './helpers/supabase'

// Funkcje nalezace do rozszerzen (pgcrypto/citext/unaccent/pg_trgm) sa zarzadzane przez
// Supabase, nie przez ten projekt — wykluczamy je po zaleznosci pg_depend (deptype='e').
const PROJECT_FUNCS = `
  select p.oid,
         p.proname,
         pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (
       select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
     )
`

type FuncRow = { oid: number; proname: string; args: string }

describe('Uprawnienia EXECUTE funkcji public (ISK-356)', () => {
  test('T2: zadna funkcja projektu w schemacie public nie jest wykonywalna przez anon', async () => {
    const executableByAnon = await withPg(async (c) => {
      const r = await c.query<FuncRow & { exec: boolean }>(
        `select proname, args, has_function_privilege('anon', oid, 'execute') as exec
           from (${PROJECT_FUNCS}) f
          where has_function_privilege('anon', oid, 'execute')`,
      )
      return r.rows.map((row) => `${row.proname}(${row.args})`)
    })
    // Lista MUSI byc pusta. Gdy czerwona: nowa funkcja odziedziczyla EXECUTE TO PUBLIC —
    // dodaj `revoke execute ... from public, anon, authenticated` w migracji funkcji.
    expect(executableByAnon).toEqual([])
  })

  test('T2: funkcje utrzymaniowe nie sa wykonywalne nawet przez authenticated', async () => {
    const leaked = await withPg(async (c) => {
      const r = await c.query<{ proname: string }>(
        `select proname
           from (${PROJECT_FUNCS}) f
          where proname in ('purge_expired_inquiries','purge_submission_throttle','purge_expired_audit_log')
            and has_function_privilege('authenticated', oid, 'execute')`,
      )
      return r.rows.map((row) => row.proname)
    })
    expect(leaked).toEqual([])
  })

  test('pozytywny: wymagane funkcje pozostaja wykonywalne dla wlasciwych ról', async () => {
    const privs = await withPg(async (c) => {
      const r = await c.query<{ proname: string; args: string; auth: boolean; svc: boolean }>(
        `select proname, args,
                has_function_privilege('authenticated', oid, 'execute') as auth,
                has_function_privilege('service_role',  oid, 'execute') as svc
           from (${PROJECT_FUNCS}) f
          where proname in ('is_admin','immutable_unaccent',
                            'purge_expired_inquiries','purge_submission_throttle','purge_expired_audit_log')`,
      )
      return r.rows
    })
    const by = (name: string) => privs.filter((p) => p.proname === name)
    // Funkcje polityk/zapisu katalogu — dostepne dla authenticated i service_role.
    for (const name of ['is_admin', 'immutable_unaccent']) {
      expect(by(name).length).toBeGreaterThan(0)
      for (const row of by(name)) {
        expect(row.auth).toBe(true)
        expect(row.svc).toBe(true)
      }
    }
    // Funkcje utrzymaniowe — wylacznie service_role.
    for (const name of ['purge_expired_inquiries', 'purge_submission_throttle', 'purge_expired_audit_log']) {
      expect(by(name).length).toBeGreaterThan(0)
      for (const row of by(name)) {
        expect(row.auth).toBe(false)
        expect(row.svc).toBe(true)
      }
    }
  })
})
