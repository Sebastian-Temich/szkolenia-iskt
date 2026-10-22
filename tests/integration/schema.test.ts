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
  // ISK-409 / UX-B3: ten test rozpoznawal zasiew po prefiksie `[DEMO]` w nazwie
  // wlasnej (`like('name', '[DEMO]%')`). Prefiks zostal z nazw wlasnych zdjety,
  // wiec rozpoznajemy zasiew po SLUGACH — kluczu naturalnym, ktory jest stabilny
  // i nie jest trescia redakcyjna. Asercja jest MOCNIEJSZA niz poprzednia: ta
  // liczyla wiersze (dowolne piec z `[DEMO]` przechodzilo), ta wymaga obecnosci
  // dokladnie tych wierszy, od ktorych zaleza bramki e2e.
  //
  // Zawieranie, a nie rownosc zbiorow: zestaw integracyjny dziala na jednej
  // bazie i inne pliki dopisuja do niej wlasne wiersze (`panel-audit` zaklada
  // szkolenia przez RPC), wiec `toEqual` na pelnej liscie zalezaloby od
  // kolejnosci plikow.
  test('P5: po db reset seed demonstracyjny jest obecny (schemat odtworzony od zera)', async () => {
    const svc = serviceClient()
    const slugi = async (tabela: string) => {
      const res = await svc.from(tabela).select('slug')
      expect(res.error, tabela).toBeNull()
      return (res.data ?? []).map((row: { slug: string }) => row.slug)
    }

    expect(await slugi('categories')).toEqual(
      expect.arrayContaining(['ai', 'esg', 'jezyk-angielski', 'projekty-br', 'rozwoj-oprogramowania']),
    )
    expect(await slugi('trainings')).toEqual(
      expect.arrayContaining(['angielski-techniczny', 'wprowadzenie-do-ai', 'zrownowazony-rozwoj-esg']),
    )
    expect(await slugi('trainers')).toEqual(
      expect.arrayContaining(['anna-testowa', 'jan-przykladowy']),
    )
  })

  // Bramka konwencji, ktorej do ISK-409 nie bylo. Sygnal o danych przykladowych
  // podajemy RAZ, w pasku nad naglowkiem (`app/(public)/layout.tsx`) — nie
  // w nazwach wlasnych. Bez tego negatywu nic nie powstrzyma kolejnego zasiewu
  // od wszycia `[DEMO]` z powrotem w `name`/`title`/`full_name` i powrotu do 29
  // widocznych wystapien na stronie glownej.
  //
  // Mierzymy WYLACZNIE wiersze zasiewu (po slugu). Wiersze zakladane przez inne
  // testy nosza wlasny prefiks `[TEST]` i nie sa przedmiotem tej konwencji;
  // wciagniecie ich tutaj zrobiloby z tego testu bramke zaleznosci miedzy
  // plikami.
  test('P5 (konwencja): nazwy wlasne w zasiewie NIE nosza prefiksu [DEMO]', async () => {
    const svc = serviceClient()
    const KATEGORIE = ['ai', 'esg', 'jezyk-angielski', 'projekty-br', 'rozwoj-oprogramowania']
    const SZKOLENIA = ['angielski-techniczny', 'wprowadzenie-do-ai', 'zrownowazony-rozwoj-esg']
    const sprawdzane: Array<[string, string, string[]]> = [
      ['categories', 'name', KATEGORIE],
      ['trainings', 'title', SZKOLENIA],
      ['trainings', 'seo_title', SZKOLENIA],
      ['trainers', 'full_name', ['anna-testowa', 'jan-przykladowy']],
    ]

    for (const [tabela, kolumna, slugi] of sprawdzane) {
      // `select('*')`, a nie `select(\`slug,${kolumna}\`)`: generyki klienta
      // Supabase parsuja liste kolumn na poziomie TYPU, wiec nazwa kolumny
      // zlozona w czasie wykonania daje `ParserError` i blad kompilacji.
      const res = await svc.from(tabela).select('*').in('slug', slugi)
      expect(res.error, `${tabela}.${kolumna}`).toBeNull()
      const wiersze = (res.data ?? []) as unknown as Array<Record<string, string | null>>
      // Kontrola zalozenia: pusta odpowiedz dalaby pusta liste naruszen
      // i zielony, niczego nie mierzacy test.
      expect(wiersze.length, `${tabela}: brak wierszy zasiewu`).toBe(slugi.length)

      const naruszenia = wiersze
        .filter((row) => (row[kolumna] ?? '').includes('[DEMO]'))
        .map((row) => `${row.slug} -> ${row[kolumna]}`)
      expect(
        naruszenia,
        `${tabela}.${kolumna} nosi [DEMO] w nazwie wlasnej — znacznik ma stac przy TWIERDZENIACH, a sygnal o srodowisku demo jest podawany raz w app/(public)/layout.tsx`,
      ).toEqual([])
    }
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
