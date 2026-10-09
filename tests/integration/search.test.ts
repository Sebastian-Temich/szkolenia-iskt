// Test wyszukiwania (model-danych.md sekcja 5, pozytywny P6).
// Dowodzi, ze: (a) wyszukiwanie pelnotekstowe znajduje szkolenie po slowie BEZ polskich
// znakow, choc tekst zrodlowy ma diakrytyki (immutable_unaccent + search_tsv), oraz
// (b) fallback trigramowy znajduje szkolenie po fragmencie tytulu (ILIKE). Oba zapytania
// wykonuje anon, wiec dzialaja tylko na wierszach opublikowanych (RLS).
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient } from './helpers/supabase'
import { createCategory, createTraining } from './helpers/fixtures'

let anon: SupabaseClient
let trainingId: string

beforeAll(async () => {
  anon = anonClient()
  const cat = await createCategory({ published: true })
  // tekst zrodlowy z polskimi znakami; fragment ASCII "katalogowy" do testu trigramu
  trainingId = await createTraining({
    published: true,
    categoryId: cat,
    title: '[TEST] Zrównoważony rozwój katalogowy',
    summary: 'Szkolenie o zrównoważonym rozwoju (dane testowe).',
  })
}, 90_000)

describe('Wyszukiwanie', () => {
  test('P6a: zapytanie bez polskich znakow (zrownowazony) znajduje tekst "zrównoważony"', async () => {
    const res = await anon
      .from('trainings')
      .select('id')
      .textSearch('search_tsv', 'zrownowazony', { type: 'plain', config: 'simple' })
    expect(res.error).toBeNull()
    expect((res.data ?? []).some((r: { id: string }) => r.id === trainingId)).toBe(true)
  })

  test('P6b: fallback trigramowy znajduje szkolenie po fragmencie tytulu', async () => {
    const res = await anon.from('trainings').select('id').ilike('title', '%katalogowy%')
    expect(res.error).toBeNull()
    expect((res.data ?? []).some((r: { id: string }) => r.id === trainingId)).toBe(true)
  })
})
