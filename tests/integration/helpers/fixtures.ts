// Fabryki danych testowych tworzone kluczem service_role (omija RLS). Kazdy rekord
// ma unikalny slug z sufiksem, prefiks [TEST] i dane fikcyjne (example.invalid),
// zeby nie kolidowac z seedem ani miedzy przebiegami.
import { randomUUID } from 'node:crypto'
import { serviceClient } from './supabase'

const sfx = () => randomUUID().slice(0, 8)

export async function createCategory(opts: { published: boolean }): Promise<string> {
  const svc = serviceClient()
  const slug = `test-kat-${sfx()}`
  const { data, error } = await svc
    .from('categories')
    .insert({
      slug,
      name: `[TEST] Kategoria ${slug}`,
      is_published: opts.published,
      published_at: opts.published ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function createTrainer(opts: { published: boolean }): Promise<string> {
  const svc = serviceClient()
  const slug = `test-trener-${sfx()}`
  const { data, error } = await svc
    .from('trainers')
    .insert({
      slug,
      full_name: `[TEST] Trener ${slug}`,
      is_published: opts.published,
      published_at: opts.published ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function createTraining(opts: {
  published: boolean
  categoryId: string
  title?: string
  summary?: string
}): Promise<string> {
  const svc = serviceClient()
  const slug = `test-szkolenie-${sfx()}`
  const { data, error } = await svc
    .from('trainings')
    .insert({
      slug,
      title: opts.title ?? `[TEST] Szkolenie ${slug}`,
      summary: opts.summary ?? 'Fikcyjne streszczenie testowe.',
      category_id: opts.categoryId,
      is_published: opts.published,
      published_at: opts.published ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function linkTrainingTrainer(trainingId: string, trainerId: string): Promise<void> {
  const svc = serviceClient()
  const { error } = await svc.from('training_trainers').insert({ training_id: trainingId, trainer_id: trainerId })
  if (error) throw error
}

export type InquiryOverrides = Record<string, unknown>

export function inquiryPayload(overrides: InquiryOverrides = {}): InquiryOverrides {
  return {
    kind: 'osoba',
    full_name: '[TEST] Zglaszajacy Testowy',
    email: `zgloszenie-${sfx()}@example.invalid`,
    phone: '+48123456789',
    interest_area: 'Testowy obszar zainteresowania',
    message: 'Fikcyjna tresc zgloszenia na potrzeby testu integracyjnego.',
    rodo_ack: true,
    rodo_clause_version: 'test-2026-10',
    ...overrides,
  }
}

export async function createInquiry(overrides: InquiryOverrides = {}): Promise<string> {
  const svc = serviceClient()
  const { data, error } = await svc.from('inquiries').insert(inquiryPayload(overrides)).select('id').single()
  if (error) throw error
  return data.id
}
