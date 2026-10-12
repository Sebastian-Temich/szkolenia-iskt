// Testy sciezki zapisu panelu administratora (ISK-374).
//   BL-A: log_admin_action() — jedyne wejscie zapisu do admin_audit_log z sesji panelu.
//         Tabela celowo nie ma polityki INSERT, wiec bez tej funkcji panel nie mial jak
//         dopisac wpisu (ADR-0003, model-danych.md sekcja 3.8).
//   BL-D: set_training_trainers() — wymiana przypisan trenerow w JEDNEJ transakcji.
//         Poprzednio DELETE i INSERT bylo dwoma zapytaniami REST, wiec blad INSERT
//         zostawial szkolenie bez zadnego trenera.
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, test } from 'vitest'
import { createCategory, createTrainer, createTraining } from './helpers/fixtures'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  USER_EMAIL,
  USER_PASSWORD,
  anonClient,
  grantAdmin,
  serviceClient,
  signedInClient,
} from './helpers/supabase'

let anon: SupabaseClient
let admin: SupabaseClient
let adminUserId: string
let user: SupabaseClient

let categoryId: string
let trainerA: string
let trainerB: string

beforeAll(async () => {
  anon = anonClient()
  const a = await signedInClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  admin = a.client
  adminUserId = a.userId
  await grantAdmin(a.userId, 'test admin')
  user = (await signedInClient(USER_EMAIL, USER_PASSWORD)).client

  categoryId = await createCategory({ published: true })
  trainerA = await createTrainer({ published: true })
  trainerB = await createTrainer({ published: true })
}, 90_000)

async function auditRows(entityId: string) {
  const { data, error } = await serviceClient()
    .from('admin_audit_log')
    .select('actor_id, action, entity, entity_id, details')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

describe('BL-A: dziennik audytu operacji administracyjnych', () => {
  test('administrator dopisuje wpis przez log_admin_action, a actor_id bierze sie z sesji', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    const { error } = await admin.rpc('log_admin_action', {
      p_action: 'training.delete',
      p_entity: 'training',
      p_entity_id: trainingId,
      p_details: {},
    })
    expect(error).toBeNull()

    const rows = await auditRows(trainingId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'training.delete',
      entity: 'training',
      entity_id: trainingId,
      actor_id: adminUserId,
    })
  })

  test('actor_id nie da sie podstawic — funkcja nie przyjmuje go jako argumentu', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await admin.rpc('log_admin_action', {
      p_action: 'training.publish',
      p_entity: 'training',
      p_entity_id: trainingId,
      p_details: {},
      p_actor_id: randomUUID(),
    })
    // PostgREST nie znajduje funkcji o takiej sygnaturze — autor wpisu zostaje przy sesji.
    expect(error).not.toBeNull()
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('administrator NIE moze pisac do admin_audit_log bezposrednio (tylko przez funkcje)', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await admin.from('admin_audit_log').insert({
      action: 'training.delete',
      entity: 'training',
      entity_id: trainingId,
      details: {},
    })
    expect(error).not.toBeNull()
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('anon nie moze wywolac log_admin_action', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await anon.rpc('log_admin_action', {
      p_action: 'training.delete',
      p_entity: 'training',
      p_entity_id: trainingId,
      p_details: {},
    })
    expect(error).not.toBeNull()
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('zalogowany uzytkownik bez admin_users nie moze wywolac log_admin_action', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await user.rpc('log_admin_action', {
      p_action: 'training.delete',
      p_entity: 'training',
      p_entity_id: trainingId,
      p_details: {},
    })
    expect(error).not.toBeNull()
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('details nie przyjmuje danych osobowych (admin_audit_log_details_no_pii)', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await admin.rpc('log_admin_action', {
      p_action: 'inquiry.status_change',
      p_entity: 'inquiry',
      p_entity_id: trainingId,
      p_details: { email: 'jan@example.invalid' },
    })
    expect(error).not.toBeNull()
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('metadane operacji (bez danych osobowych) sa zapisywane', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await admin.rpc('log_admin_action', {
      p_action: 'inquiry.status_change',
      p_entity: 'inquiry',
      p_entity_id: trainingId,
      p_details: { from: 'zamkniete', to: 'w_toku' },
    })
    expect(error).toBeNull()
    const rows = await auditRows(trainingId)
    expect(rows[0]?.details).toEqual({ from: 'zamkniete', to: 'w_toku' })
  })
})

async function trainerIdsOf(trainingId: string): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from('training_trainers')
    .select('trainer_id, sort_order')
    .eq('training_id', trainingId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => row.trainer_id as string)
}

describe('BL-D: atomowa wymiana przypisan trenerow', () => {
  test('wymiana zachowuje kolejnosc z formularza', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    const first = await admin.rpc('set_training_trainers', {
      p_training_id: trainingId,
      p_trainer_ids: [trainerA, trainerB],
    })
    expect(first.error).toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA, trainerB])

    const second = await admin.rpc('set_training_trainers', {
      p_training_id: trainingId,
      p_trainer_ids: [trainerB, trainerA],
    })
    expect(second.error).toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([trainerB, trainerA])
  })

  test('pusta lista usuwa wszystkie przypisania', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })

    const { error } = await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [] })
    expect(error).toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([])
  })

  // Rdzen defektu BL-D: wczesniej DELETE juz sie wykonal, a nieudany INSERT zostawial
  // szkolenie BEZ zadnego trenera (publiczna strona szczegolu tracila "Prowadzacy").
  test('nieudany INSERT nie zostawia szkolenia bez trenerow', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])

    const { error } = await admin.rpc('set_training_trainers', {
      p_training_id: trainingId,
      // Drugi identyfikator nie istnieje — FK odrzuca INSERT (tak samo jak trener
      // usuniety rownolegle przez innego administratora).
      p_trainer_ids: [trainerB, randomUUID()],
    })
    expect(error).not.toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])
  })

  test('zalogowany uzytkownik bez admin_users nie zmienia przypisan (RLS dalej dziala)', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })

    const { error } = await user.rpc('set_training_trainers', {
      p_training_id: trainingId,
      p_trainer_ids: [trainerB],
    })
    expect(error).not.toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])
  })

  // Osobny przypadek, bo to jedyna sciezka, w ktorej funkcja nie wykonuje zadnego
  // INSERT-a: gdyby DELETE nie byl filtrowany przez RLS, pusta tablica od nie-admina
  // skasowalaby przypisania BEZ zadnego bledu (cichy ubytek danych).
  test('pusta lista od uzytkownika bez admin_users nie kasuje przypisan', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })

    await user.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [] })
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])
  })

  test('anon nie moze wywolac set_training_trainers', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })

    const { error } = await anon.rpc('set_training_trainers', {
      p_training_id: trainingId,
      p_trainer_ids: [],
    })
    expect(error).not.toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])
  })
})
