// Testy RLS zgloszen — danych osobowych (model-danych.md sekcja 5).
// Pozytywne: P3(zgloszenia). Negatywne: N3, N4, N5(zgloszenia).
// inquiries NIE ma polityk dla anon/authenticated poza administratorem; zapis tylko service_role.
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, signedInClient, grantAdmin, ADMIN_EMAIL, ADMIN_PASSWORD, USER_EMAIL, USER_PASSWORD } from './helpers/supabase'
import { createInquiry, inquiryPayload } from './helpers/fixtures'

let anon: SupabaseClient
let admin: SupabaseClient
let user: SupabaseClient
let inquiryId: string

beforeAll(async () => {
  anon = anonClient()
  const a = await signedInClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  admin = a.client
  await grantAdmin(a.userId, 'test admin')
  user = (await signedInClient(USER_EMAIL, USER_PASSWORD)).client
  inquiryId = await createInquiry()
}, 90_000)

describe('Zgloszenia — RLS', () => {
  test('P3 (zgloszenia): administrator widzi zgloszenia', async () => {
    const res = await admin.from('inquiries').select('id, email, status').eq('id', inquiryId)
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(1)
  })

  test('N3: anon SELECT na inquiries -> zero wierszy / odmowa', async () => {
    const res = await anon.from('inquiries').select('id').eq('id', inquiryId)
    const denied = res.error !== null || (res.data ?? []).length === 0
    expect(denied).toBe(true)
    // nigdy nie moze zobaczyc konkretnego wiersza z danymi osobowymi
    expect((res.data ?? []).some((r: { id: string }) => r.id === inquiryId)).toBe(false)
  })

  test('N4: anon INSERT do inquiries -> odmowa', async () => {
    const res = await anon.from('inquiries').insert(inquiryPayload()).select('id')
    expect(res.error).not.toBeNull()
  })

  test('N5 (zgloszenia): zalogowany bez admina nie widzi zgloszen', async () => {
    const res = await user.from('inquiries').select('id').eq('id', inquiryId)
    // ma GRANT SELECT jako authenticated, ale polityka is_admin()=false => zero wierszy
    expect(res.error).toBeNull()
    expect(res.data).toHaveLength(0)
  })
})
