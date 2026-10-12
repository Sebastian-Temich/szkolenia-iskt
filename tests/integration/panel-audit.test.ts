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
  withPg,
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

// ---------------------------------------------------------------------------------------
// U1: atomowy zapis szkolenia (wiersz + trenerzy + wpis w dzienniku w JEDNEJ transakcji).
// Poprzednio zapis wiersza i wymiana trenerow byly dwoma zapytaniami REST, wiec para
// "zapis szkolenia + wymiana przypisan" mogla rozjechac sie w polowie: tytul juz zapisany,
// dziennik pusty, cache nieuniewazniony, a komunikat mowil tylko o trenerach.
// ---------------------------------------------------------------------------------------

function trainingPayload(overrides: Record<string, unknown> = {}) {
  return {
    slug: `test-save-${randomUUID().slice(0, 8)}`,
    title: '[TEST] Szkolenie zapisane przez RPC',
    summary: 'Fikcyjne streszczenie testowe o wystarczajacej dlugosci.',
    description: 'Opis testowy.',
    category_id: categoryId,
    level: 'podstawowy',
    duration_hours: 8,
    price_net_pln: 1200,
    funding_available: false,
    funding_note: null,
    learning_outcomes: [],
    target_audience: null,
    terms_note: '',
    is_featured: false,
    sort_order: 100,
    seo_title: null,
    seo_description: null,
    ...overrides,
  }
}

async function trainingRow(id: string) {
  const { data, error } = await serviceClient()
    .from('trainings')
    .select('id, title, slug, is_published, is_featured, seo_title, program, learning_outcomes')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

describe('U1: save_training — zapis, trenerzy i dziennik w jednej transakcji', () => {
  test('tworzy szkolenie, przypisuje trenerow i zapisuje wpis w dzienniku', async () => {
    const { data: newId, error } = await admin.rpc('save_training', {
      p_training_id: null,
      p_training: trainingPayload({ is_featured: true, seo_title: 'Tytul SEO' }),
      p_trainer_ids: [trainerA, trainerB],
    })
    expect(error).toBeNull()
    expect(newId).toBeTruthy()

    const row = await trainingRow(newId as string)
    expect(row).toMatchObject({ is_featured: true, seo_title: 'Tytul SEO', is_published: false })
    expect(await trainerIdsOf(newId as string)).toEqual([trainerA, trainerB])

    const rows = await auditRows(newId as string)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'training.create',
      entity: 'training',
      actor_id: adminUserId,
      details: { trainers: 2 },
    })
  })

  test('edycja nadpisuje pola i zapisuje wpis training.update', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    const { error } = await admin.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload({ title: '[TEST] Tytul po edycji' }),
      p_trainer_ids: [trainerA],
    })
    expect(error).toBeNull()
    expect((await trainingRow(trainingId))?.title).toBe('[TEST] Tytul po edycji')
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])
    expect(await auditRows(trainingId)).toMatchObject([{ action: 'training.update' }])
  })

  // RDZEN U1 — dokladny scenariusz recenzenta: administrator zmienia tytul i odznacza
  // trenera, a rownolegle ktos usuwa tego trenera. Wczesniej tytul BYL juz zapisany,
  // dziennik zostawal pusty, a komunikat mowil wylacznie o trenerach.
  test('nieudana wymiana trenerow wycofuje ROWNIEZ zapis wiersza i wpis w dzienniku', async () => {
    const trainingId = await createTraining({ published: false, categoryId, title: '[TEST] Tytul przed' })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })

    const { error } = await admin.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload({ title: '[TEST] Tytul po edycji' }),
      // Trener nie istnieje — FK odrzuca INSERT, tak jak trener usuniety rownolegle.
      p_trainer_ids: [trainerB, randomUUID()],
    })
    expect(error).not.toBeNull()

    expect((await trainingRow(trainingId))?.title).toBe('[TEST] Tytul przed')
    expect(await trainerIdsOf(trainingId)).toEqual([trainerA])
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  // Druga polowa U1: przy TWORZENIU nieudane przypisanie zostawialo szkolenie-sierote,
  // a ponowny zapis uderzal w unique(slug) — administrator w zaulku.
  test('nieudane tworzenie nie zostawia szkolenia-sieroty (slug zostaje wolny)', async () => {
    const payload = trainingPayload()

    const first = await admin.rpc('save_training', {
      p_training_id: null,
      p_training: payload,
      p_trainer_ids: [randomUUID()],
    })
    expect(first.error).not.toBeNull()

    const { data: orphans } = await serviceClient()
      .from('trainings')
      .select('id')
      .eq('slug', payload.slug)
    expect(orphans ?? []).toHaveLength(0)

    // Ten sam slug da sie zapisac ponownie — zaden sierota nie blokuje unique.
    const second = await admin.rpc('save_training', {
      p_training_id: null,
      p_training: payload,
      p_trainer_ids: [trainerA],
    })
    expect(second.error).toBeNull()
  })

  // Lista kolumn w funkcji jest granica bezpieczenstwa: formularz edycji nie moze
  // opublikowac szkolenia "po drodze", bo publikacja ma osobna sciezke (setPublished).
  test('payload nie moze ustawic is_published ani published_at', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    const { error } = await admin.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload({ is_published: true, published_at: new Date().toISOString() }),
      p_trainer_ids: [],
    })
    expect(error).toBeNull()
    expect((await trainingRow(trainingId))?.is_published).toBe(false)
  })

  // BL-C: `program` (jsonb z sekcjami) jest swiadomie poza formularzem. Pominiecie kolumny
  // w UPDATE musi ZACHOWAC jej wartosc — inaczej zapis z panelu wyczyscilby program z seedu.
  test('zapis z panelu nie czysci kolumny `program` (dlug BL-C)', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const program = [{ title: 'Modul 1', items: ['Punkt A'] }]
    const seeded = await serviceClient().from('trainings').update({ program }).eq('id', trainingId)
    expect(seeded.error).toBeNull()

    const { error } = await admin.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload(),
      p_trainer_ids: [],
    })
    expect(error).toBeNull()
    expect((await trainingRow(trainingId))?.program).toEqual(program)
  })

  test('learning_outcomes zachowuje kolejnosc, a brak pola daje pusta tablice', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    await admin.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload({ learning_outcomes: ['Ocena ryzyka', 'Procedury kontrolne'] }),
      p_trainer_ids: [],
    })
    expect((await trainingRow(trainingId))?.learning_outcomes).toEqual([
      'Ocena ryzyka',
      'Procedury kontrolne',
    ])

    await admin.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload({ learning_outcomes: [] }),
      p_trainer_ids: [],
    })
    expect((await trainingRow(trainingId))?.learning_outcomes).toEqual([])
  })

  test('uzytkownik bez admin_users nie zapisze szkolenia (RLS dalej dziala)', async () => {
    const trainingId = await createTraining({ published: false, categoryId, title: '[TEST] Tytul przed' })

    const { error } = await user.rpc('save_training', {
      p_training_id: trainingId,
      p_training: trainingPayload({ title: '[TEST] Podmieniony' }),
      p_trainer_ids: [],
    })
    expect(error).not.toBeNull()
    expect((await trainingRow(trainingId))?.title).toBe('[TEST] Tytul przed')
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('anon nie moze wywolac save_training', async () => {
    const { error } = await anon.rpc('save_training', {
      p_training_id: null,
      p_training: trainingPayload(),
      p_trainer_ids: [],
    })
    expect(error).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------------------
// U2: usuniecie i wpis w dzienniku w jednej transakcji. Wpis skladany PO commicie nie
// chronil niczego — gdy zapis dziennika padl, pozycja byla juz nieodwracalnie usunieta
// i nadal bez sladu, czyli dokladnie to, czego zabrania ADR-0003.
// ---------------------------------------------------------------------------------------
describe('U2: delete_catalog_item — usuniecie i dziennik w jednej transakcji', () => {
  test('usuwa pozycje i zapisuje wpis w dzienniku', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    const { error } = await admin.rpc('delete_catalog_item', {
      p_kind: 'training',
      p_id: trainingId,
    })
    expect(error).toBeNull()
    expect(await trainingRow(trainingId)).toBeNull()
    expect(await auditRows(trainingId)).toMatchObject([
      { action: 'training.delete', entity: 'training', actor_id: adminUserId },
    ])
  })

  // RDZEN U2: wymuszamy blad SAMEGO zapisu dziennika (trigger odrzucajacy wpis) i
  // sprawdzamy, ze usuniecie zostalo WYCOFANE. Stan "usuniete bez sladu" ma byc
  // nieosiagalny, a nie tylko zglaszany administratorowi po fakcie.
  test('nieudany zapis dziennika WYCOFUJE usuniecie', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    await withPg(async (c) => {
      await c.query(`
        create or replace function public.__test_blokuj_dziennik() returns trigger
        language plpgsql as $$ begin
          raise exception 'symulowany blad zapisu dziennika';
        end $$;
        create trigger __test_blokuj_dziennik before insert on public.admin_audit_log
          for each row execute function public.__test_blokuj_dziennik();
      `)
    })
    try {
      const { error } = await admin.rpc('delete_catalog_item', {
        p_kind: 'training',
        p_id: trainingId,
      })
      expect(error).not.toBeNull()
      // Pozycja MUSI nadal istniec — to jest cala wlasnosc U2.
      expect(await trainingRow(trainingId)).not.toBeNull()
    } finally {
      await withPg(async (c) => {
        await c.query(`
          drop trigger if exists __test_blokuj_dziennik on public.admin_audit_log;
          drop function if exists public.__test_blokuj_dziennik();
        `)
      })
    }

    // Kontrola: po zdjeciu triggera to samo usuniecie przechodzi i zostawia slad.
    const { error } = await admin.rpc('delete_catalog_item', {
      p_kind: 'training',
      p_id: trainingId,
    })
    expect(error).toBeNull()
    expect(await trainingRow(trainingId)).toBeNull()
    expect(await auditRows(trainingId)).toMatchObject([{ action: 'training.delete' }])
  })

  // RLS filtruje DELETE jak WHERE, wiec bez kontroli row_count nie-admin dostawal
  // CICHY sukces, a panel dopisywal do dziennika usuniecie, ktore sie nie odbylo.
  test('uzytkownik bez admin_users nie usuwa i dostaje blad, nie cichy sukces', async () => {
    const trainingId = await createTraining({ published: false, categoryId })

    const { error } = await user.rpc('delete_catalog_item', {
      p_kind: 'training',
      p_id: trainingId,
    })
    expect(error).not.toBeNull()
    expect(await trainingRow(trainingId)).not.toBeNull()
    expect(await auditRows(trainingId)).toHaveLength(0)
  })

  test('nieistniejaca pozycja to blad, a dziennik zostaje pusty', async () => {
    const missing = randomUUID()
    const { error } = await admin.rpc('delete_catalog_item', {
      p_kind: 'training',
      p_id: missing,
    })
    expect(error).not.toBeNull()
    expect(await auditRows(missing)).toHaveLength(0)
  })

  test('nieznany rodzaj pozycji jest odrzucany', async () => {
    const { error } = await admin.rpc('delete_catalog_item', {
      p_kind: 'admin_users',
      p_id: randomUUID(),
    })
    expect(error).not.toBeNull()
  })

  test('usuniecie szkolenia kasuje przypisania trenerow i zostawia slad', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    await admin.rpc('set_training_trainers', { p_training_id: trainingId, p_trainer_ids: [trainerA] })

    const { error } = await admin.rpc('delete_catalog_item', {
      p_kind: 'training',
      p_id: trainingId,
    })
    expect(error).toBeNull()
    expect(await trainerIdsOf(trainingId)).toEqual([])
    expect(await auditRows(trainingId)).toMatchObject([{ action: 'training.delete' }])
  })

  test('anon nie moze wywolac delete_catalog_item', async () => {
    const trainingId = await createTraining({ published: false, categoryId })
    const { error } = await anon.rpc('delete_catalog_item', {
      p_kind: 'training',
      p_id: trainingId,
    })
    expect(error).not.toBeNull()
    expect(await trainingRow(trainingId)).not.toBeNull()
  })
})
