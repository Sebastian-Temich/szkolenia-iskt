// Testy triggerow zgloszen (model-danych.md sekcja 5).
// Pozytywne: P4. Negatywne: N6, N7, N8, N9.
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient, signedInClient, grantAdmin, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers/supabase'
import { createInquiry, inquiryPayload } from './helpers/fixtures'

let admin: SupabaseClient

beforeAll(async () => {
  const a = await signedInClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  admin = a.client
  await grantAdmin(a.userId, 'test admin')
}, 90_000)

describe('Zgloszenia — triggery', () => {
  test('P4: administrator zmienia status nowe -> w_toku -> zamkniete; wpisy w historii', async () => {
    const id = await createInquiry()

    const toProgress = await admin.from('inquiries').update({ status: 'w_toku' }).eq('id', id).select('status, first_handled_at').single()
    expect(toProgress.error).toBeNull()
    expect(toProgress.data?.status).toBe('w_toku')
    expect(toProgress.data?.first_handled_at).not.toBeNull()

    const toClosed = await admin.from('inquiries').update({ status: 'zamkniete' }).eq('id', id).select('status, closed_at').single()
    expect(toClosed.error).toBeNull()
    expect(toClosed.data?.status).toBe('zamkniete')
    expect(toClosed.data?.closed_at).not.toBeNull()

    const history = await admin
      .from('inquiry_status_history')
      .select('from_status, to_status')
      .eq('inquiry_id', id)
      .order('changed_at', { ascending: true })
    expect(history.error).toBeNull()
    expect(history.data).toHaveLength(2)
    expect(history.data?.[0]).toMatchObject({ from_status: 'nowe', to_status: 'w_toku' })
    expect(history.data?.[1]).toMatchObject({ from_status: 'w_toku', to_status: 'zamkniete' })
  })

  test('N6: administrator probuje zmienic email/message zgloszenia -> wyjatek z triggera', async () => {
    const id = await createInquiry()
    const email = await admin.from('inquiries').update({ email: 'podmiana@example.invalid' }).eq('id', id).select('id')
    expect(email.error).not.toBeNull()

    const msg = await admin.from('inquiries').update({ message: 'Podmieniona tresc zgloszenia testowego.' }).eq('id', id).select('id')
    expect(msg.error).not.toBeNull()
  })

  test('N7: niedozwolone przejscie statusu (zamkniete -> nowe) -> wyjatek', async () => {
    const id = await createInquiry()
    const close = await admin.from('inquiries').update({ status: 'zamkniete' }).eq('id', id).select('status').single()
    expect(close.error).toBeNull()
    expect(close.data?.status).toBe('zamkniete')

    const reopenToNew = await admin.from('inquiries').update({ status: 'nowe' }).eq('id', id).select('id')
    expect(reopenToNew.error).not.toBeNull()
  })

  test('N8: INSERT zgloszenia z rodo_ack=false -> naruszenie CHECK', async () => {
    // service_role omija RLS, ale CHECK dalej obowiazuje
    const res = await serviceClient().from('inquiries').insert(inquiryPayload({ rodo_ack: false })).select('id')
    expect(res.error).not.toBeNull()
  })

  test('N9: zgloszenie kind=firma bez company_name -> naruszenie CHECK', async () => {
    const res = await serviceClient()
      .from('inquiries')
      .insert(inquiryPayload({ kind: 'firma', company_name: null }))
      .select('id')
    expect(res.error).not.toBeNull()
  })
})
