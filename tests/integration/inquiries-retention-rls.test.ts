// Testy RLS/grantow retencji zgloszen (ISK-371, ustalenie N4 z security review ISK-350).
// Cel: UPDATE administratora (authenticated + is_admin()) jest zawezony do kolumn
// operacyjnych panelu (status, admin_note). Retencja danych osobowych
// (retention_delete_after) nie moze byc obchodzona recznym UPDATE — ani przez
// administratora (grant kolumnowy), ani przez sciezke omijajaca grant (trigger).
import { beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  serviceClient,
  signedInClient,
  grantAdmin,
  withPg,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from './helpers/supabase'
import { createInquiry } from './helpers/fixtures'

let admin: SupabaseClient

// Odczytuje aktualny termin retencji kluczem service_role (omija RLS) — kontrola,
// ze proby obejscia NIE zmienily wartosci w bazie.
async function retentionOf(id: string): Promise<string> {
  const res = await serviceClient().from('inquiries').select('retention_delete_after').eq('id', id).single()
  expect(res.error).toBeNull()
  return res.data?.retention_delete_after as string
}

beforeAll(async () => {
  const a = await signedInClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  admin = a.client
  await grantAdmin(a.userId, 'test admin')
}, 90_000)

describe('Zgloszenia — zawezony UPDATE i obrona retencji (N4)', () => {
  test('macierz grantow: authenticated ma UPDATE wylacznie na (status, admin_note)', async () => {
    const cols = await withPg(async (c) => {
      const r = await c.query(
        `select column_name
           from information_schema.column_privileges
          where table_schema = 'public'
            and table_name = 'inquiries'
            and grantee = 'authenticated'
            and privilege_type = 'UPDATE'
          order by column_name`,
      )
      return r.rows.map((row: { column_name: string }) => row.column_name)
    })
    expect(cols).toEqual(['admin_note', 'status'])
  })

  test('P (panel): administrator zmienia status (nowe -> w_toku)', async () => {
    const id = await createInquiry()
    const res = await admin.from('inquiries').update({ status: 'w_toku' }).eq('id', id).select('status').single()
    expect(res.error).toBeNull()
    expect(res.data?.status).toBe('w_toku')
  })

  test('P (panel): administrator zapisuje admin_note', async () => {
    const id = await createInquiry()
    const res = await admin
      .from('inquiries')
      .update({ admin_note: 'Notatka operacyjna testowa.' })
      .eq('id', id)
      .select('admin_note')
      .single()
    expect(res.error).toBeNull()
    expect(res.data?.admin_note).toBe('Notatka operacyjna testowa.')
  })

  test('N4: administrator probuje odroczyc retencje (retention_delete_after w przyszlosc) -> odmowa', async () => {
    const id = await createInquiry()
    const before = await retentionOf(id)
    const res = await admin
      .from('inquiries')
      .update({ retention_delete_after: '2999-12-31' })
      .eq('id', id)
      .select('id')
    expect(res.error).not.toBeNull()
    // Wartosc w bazie nie zostala zmieniona.
    expect(await retentionOf(id)).toBe(before)
  })

  test('N4: administrator probuje przyspieszyc kasowanie (retention_delete_after w przeszlosc) -> odmowa', async () => {
    const id = await createInquiry()
    const before = await retentionOf(id)
    const res = await admin
      .from('inquiries')
      .update({ retention_delete_after: '2000-01-01' })
      .eq('id', id)
      .select('id')
    expect(res.error).not.toBeNull()
    expect(await retentionOf(id)).toBe(before)
  })

  test('N4: administrator probuje UPDATE pol notyfikacji (poza grantem) -> odmowa', async () => {
    const id = await createInquiry()
    const res = await admin
      .from('inquiries')
      .update({ notification_status: 'sent' })
      .eq('id', id)
      .select('id')
    expect(res.error).not.toBeNull()
  })

  test('N4 (obrona w glab): nawet service_role nie zmieni retention_delete_after przez UPDATE', async () => {
    const id = await createInquiry()
    const before = await retentionOf(id)
    // service_role ma GRANT ALL + BYPASSRLS, ale trigger BEFORE UPDATE i tak odrzuca.
    const res = await serviceClient()
      .from('inquiries')
      .update({ retention_delete_after: '2999-12-31' })
      .eq('id', id)
      .select('id')
    expect(res.error).not.toBeNull()
    expect(await retentionOf(id)).toBe(before)
  })

  test('kontrola pozytywna: service_role nadal aktualizuje notification_status (sciezka serwerowa)', async () => {
    const id = await createInquiry()
    const res = await serviceClient()
      .from('inquiries')
      .update({ notification_status: 'sent', notification_sent_at: new Date().toISOString() })
      .eq('id', id)
      .select('notification_status')
      .single()
    expect(res.error).toBeNull()
    expect(res.data?.notification_status).toBe('sent')
  })
})
