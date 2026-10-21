// Testy RLS katalogu publicznego (model-danych.md sekcja 5).
// Pozytywne: P1, P2, P3(szkice). Negatywne: N1, N2, N5(katalog).
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, serviceClient, signedInClient, grantAdmin, ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD } from './helpers/supabase'
import { createCategory, createTrainer, createTraining, linkTrainingTrainer } from './helpers/fixtures'

let anon: SupabaseClient
let admin: SupabaseClient
let user: SupabaseClient

// Wspolne fikstury
let pubCategory: string
let pubTraining: string
let pubTrainer: string
let draftTraining: string
let draftTrainer: string
let linkPub: string // training_id z opublikowanym powiazaniem
let linkDraftTrainerTraining: string // training opublikowany, trener szkic

beforeAll(async () => {
  anon = anonClient()
  const a = await signedInClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  admin = a.client
  await grantAdmin(a.userId, 'test admin')
  user = (await signedInClient(USER_EMAIL, USER_PASSWORD)).client

  pubCategory = await createCategory({ published: true })
  pubTrainer = await createTrainer({ published: true })
  pubTraining = await createTraining({ published: true, categoryId: pubCategory })
  draftTraining = await createTraining({ published: false, categoryId: pubCategory })
  draftTrainer = await createTrainer({ published: false })

  // P2: oba opublikowane
  linkPub = await createTraining({ published: true, categoryId: pubCategory })
  await linkTrainingTrainer(linkPub, pubTrainer)

  // N2: trening opublikowany, trener szkic
  linkDraftTrainerTraining = await createTraining({ published: true, categoryId: pubCategory })
  await linkTrainingTrainer(linkDraftTrainerTraining, draftTrainer)
}, 90_000)

describe('Katalog publiczny — RLS', () => {
  test('P1: anon widzi opublikowane szkolenie, kategorie i trenera', async () => {
    const t = await anon.from('trainings').select('id').eq('id', pubTraining)
    expect(t.error).toBeNull()
    expect(t.data).toHaveLength(1)

    const c = await anon.from('categories').select('id').eq('id', pubCategory)
    expect(c.data).toHaveLength(1)

    const r = await anon.from('trainers').select('id').eq('id', pubTrainer)
    expect(r.data).toHaveLength(1)
  })

  test('P2: anon widzi powiazanie training_trainers, gdy obie strony opublikowane', async () => {
    const res = await anon.from('training_trainers').select('training_id, trainer_id').eq('training_id', linkPub)
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(res.data?.[0]?.trainer_id).toBe(pubTrainer)
  })

  test('P3 (szkice): administrator widzi szkice szkolen', async () => {
    const res = await admin.from('trainings').select('id, is_published').eq('id', draftTraining)
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
    expect(res.data?.[0]?.is_published).toBe(false)
  })

  test('N1: anon nie widzi szkolenia is_published=false — zero wierszy', async () => {
    const res = await anon.from('trainings').select('id').eq('id', draftTraining)
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(0)
  })

  test('N2: anon nie widzi training_trainers, gdy trener jest szkicem', async () => {
    const res = await anon
      .from('training_trainers')
      .select('training_id')
      .eq('training_id', linkDraftTrainerTraining)
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(0)
  })

  test('N5 (katalog): zalogowany bez admina nie widzi szkicow i nie moze publikowac', async () => {
    // nie widzi szkicu
    const seen = await user.from('trainings').select('id').eq('id', draftTraining)
    expect(seen.data).toHaveLength(0)

    // nie moze wstawic szkolenia (WITH CHECK is_admin() = false)
    const ins = await user
      .from('trainings')
      .insert({ slug: `nieuprawniony-${Date.now()}`, title: 'x', summary: 'x', category_id: pubCategory })
      .select('id')
    expect(ins.error).not.toBeNull()

    // nie moze opublikowac cudzego szkolenia — polityka nie dopasowuje wiersza (0 zmian)
    const upd = await user.from('trainings').update({ is_published: true }).eq('id', draftTraining).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    // kontrola: szkic nadal nieopublikowany
    const check = await serviceClient().from('trainings').select('is_published').eq('id', draftTraining).single()
    expect(check.data?.is_published).toBe(false)
  })
})
