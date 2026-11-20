/**
 * Money — testes de BACKEND REAL (Supabase de HOMOLOGAÇÃO). Cobrem: autenticação, isolamento A×B, permissões,
 * limites de plano, devolução de cota ao apagar, recursos por plano e sincronização entre dispositivos.
 * Sem o projeto de homologação, TODOS ficam "Bloqueado por dependência externa" (skip) — nunca "aprovados".
 */
import { test, expect } from '@playwright/test'
import { USER_A, USER_B } from '../../helpers/env'
import { READY, BLOCKED_MSG, assertNotProduction, anon, admin, signedIn, resetUser, firstAccount, tx } from '../../helpers/homolog'
import { randomUUID } from 'node:crypto'

test.describe.configure({ mode: 'serial' })
test.skip(!READY, BLOCKED_MSG)

let A: Awaited<ReturnType<typeof signedIn>>, B: Awaited<ReturnType<typeof signedIn>>, accA: string, accB: string

test.beforeAll(async () => {
  assertNotProduction()
  A = await signedIn(USER_A); B = await signedIn(USER_B)
  accA = await firstAccount(A.db, A.id); accB = await firstAccount(B.db, B.id)
  await resetUser(A.id, 'start'); await resetUser(B.id, 'start')
})

const used = async (db = A.db) => { const { data, error } = await db.rpc('tx_usage'); expect(error).toBeNull(); return (data as { used: number; lim: number }[])[0] }

test.describe('Autenticação', () => {
  test('AUTH-01 login válido devolve sessão', async () => { expect(A.id).toMatch(/[0-9a-f-]{36}/); const { data } = await A.db.auth.getSession(); expect(data.session?.access_token).toBeTruthy() })
  test('AUTH-02 senha errada é recusada', async () => { const { error } = await anon().auth.signInWithPassword({ email: USER_A.email, password: 'senha-errada-xyz' }); expect(error).not.toBeNull() })
  test('AUTH-03 sessão renova o token (refresh)', async () => { const { data, error } = await A.db.auth.refreshSession(); expect(error).toBeNull(); expect(data.session?.access_token).toBeTruthy() })
  test('AUTH-04 sem login não lê dados', async () => { const { data } = await anon().from('transactions').select('id').limit(5); expect(data ?? []).toHaveLength(0) })
  test('AUTH-05 após logout o token não dá acesso', async () => {
    const c = await signedIn(USER_A); await c.db.auth.signOut(); const { data } = await c.db.from('transactions').select('id').limit(5); expect(data ?? []).toHaveLength(0)
  })
  test('AUTH-06 recuperação de senha aceita o pedido', async () => { const { error } = await anon().auth.resetPasswordForEmail(USER_A.email); expect(error, 'se falhar por limite de envio, aguarde e repita').toBeNull() })
})

test.describe('Isolamento entre usuários', () => {
  test('ISO-01 B não lê lançamentos/contas/metas de A', async () => {
    await A.db.from('transactions').insert(tx(A.id, accA, 'ISO-A-secreto'))
    for (const t of ['transactions', 'accounts', 'goals', 'loans', 'budgets', 'profiles']) {
      const { data } = await B.db.from(t).select('*').eq(t === 'profiles' ? 'id' : 'user_id', A.id)
      expect(data ?? [], `B enxergou ${t} de A`).toHaveLength(0)
    }
  })
  test('ISO-02 B não altera nem apaga dados de A', async () => {
    await B.db.from('transactions').update({ description: 'HACK' }).eq('user_id', A.id); await B.db.from('transactions').delete().eq('user_id', A.id)
    const { data } = await A.db.from('transactions').select('description').eq('description', 'ISO-A-secreto'); expect(data).toHaveLength(1)
  })
  test('ISO-03 B não lança na conta de A nem em nome de A', async () => {
    expect((await B.db.from('transactions').insert(tx(B.id, accA, 'ISO-invade'))).error).not.toBeNull()
    expect((await B.db.from('transactions').insert(tx(A.id, accB, 'ISO-falsifica'))).error).not.toBeNull()
  })
})

test.describe('Permissões', () => {
  test('PERM-01 usuário não altera o próprio plano/validade/papel', async () => {
    for (const patch of [{ plan_id: 'premium' }, { paid_until: '2099-01-01' }, { is_lifetime: true }, { role: 'admin' }, { billing_status: 'active' }]) {
      await A.db.from('profiles').update(patch).eq('id', A.id)
    }
    const { data } = await admin().from('profiles').select('plan_id,is_lifetime,role').eq('id', A.id).single()
    expect(data).toMatchObject({ plan_id: 'start', is_lifetime: false }); expect(data?.role).not.toBe('admin')
  })
  test('PERM-02 usuário não chama funções de cobrança', async () => {
    for (const fn of ['kiwify_apply_grant', 'kiwify_apply_status', 'kiwify_dead_letter']) expect((await A.db.rpc(fn, {})).error, fn).not.toBeNull()
  })
  test('PERM-03 usuário não lê tabelas de cobrança nem a auditoria', async () => {
    for (const t of ['billing_events', 'billing_pending', 'billing_dead_letters', 'tx_deletion_audit']) {
      const r = await A.db.from(t).select('*').limit(1); expect(r.error !== null || (r.data ?? []).length === 0, t).toBe(true)
    }
  })
})

test.describe('Limites de plano e cota', () => {
  test.beforeEach(async () => { await resetUser(A.id, 'start') })
  test('PLAN-01 Start: 25 lançamentos entram e o 26º é bloqueado', async () => {
    const base = (await used()).used
    const rows = Array.from({ length: 25 - base }, (_, i) => tx(A.id, accA, `PLAN-${i}`))
    expect((await A.db.from('transactions').insert(rows)).error).toBeNull()
    expect((await used()).used).toBe(25)
    expect((await A.db.from('transactions').insert(tx(A.id, accA, 'PLAN-26'))).error?.message).toMatch(/limite/i)
  })
  test('PLAN-02 apagar um lançamento devolve a cota', async () => {
    const before = (await used()).used
    await A.db.from('transactions').insert(tx(A.id, accA, 'PLAN-dev')); expect((await used()).used).toBe(before + 1)
    await A.db.from('transactions').delete().eq('description', 'PLAN-dev'); expect((await used()).used).toBe(before)
  })
  test('PLAN-03 parcelamento conta 1; apagar parte não devolve, apagar tudo devolve', async () => {
    const before = (await used()).used, sid = randomUUID()
    expect((await A.db.from('transactions').insert(Array.from({ length: 12 }, (_, i) => tx(A.id, accA, `PARC-${i}`, { series_id: sid })))).error).toBeNull()
    expect((await used()).used).toBe(before + 1)
    await A.db.from('transactions').delete().eq('description', 'PARC-0'); expect((await used()).used).toBe(before + 1)
    await A.db.from('transactions').delete().eq('series_id', sid); expect((await used()).used).toBe(before)
  })
  test('PLAN-04 created_at forjado é ignorado (não escapa da cota)', async () => {
    await A.db.from('transactions').insert(tx(A.id, accA, 'PLAN-forjado', { created_at: '2020-01-01T00:00:00Z' }))
    const { data } = await A.db.from('transactions').select('created_at').eq('description', 'PLAN-forjado').single()
    expect(new Date(data!.created_at).getFullYear()).toBeGreaterThanOrEqual(2026)
  })
  test('PLAN-05 series_id forjado = id de outro lançamento é recusado', async () => {
    const { data } = await A.db.from('transactions').insert(tx(A.id, accA, 'PLAN-alvo')).select('id').single()
    expect((await A.db.from('transactions').insert(tx(A.id, accA, 'PLAN-colisao', { series_id: data!.id }))).error).not.toBeNull()
  })
  test('PLAN-06 apagar fica registrado na auditoria (visível só ao service role)', async () => {
    await A.db.from('transactions').insert(tx(A.id, accA, 'PLAN-audit')); await A.db.from('transactions').delete().eq('description', 'PLAN-audit')
    const { data } = await admin().from('tx_deletion_audit').select('quota_returned,deleted_by').eq('user_id', A.id).order('audit_id', { ascending: false }).limit(1)
    expect(data?.[0]).toMatchObject({ quota_returned: true, deleted_by: A.id })
  })
  test('PLAN-07 Premium não tem limite mensal', async () => {
    await resetUser(A.id, 'premium'); const { data } = await A.db.rpc('tx_usage'); expect((data as { lim: number | null }[])[0].lim).toBeNull()
  })
})

test.describe('Recursos por plano (no banco)', () => {
  test('FEAT-01 Start não cria empréstimo nem orçamento; Plus cria empréstimo; Pro cria orçamento', async () => {
    await resetUser(A.id, 'start')
    const { data: cat } = await A.db.from('categories').select('id').eq('type', 'expense').limit(1).single()
    expect((await A.db.from('loans').insert({ user_id: A.id, account_id: accA, counterparty: 'TESTE x', direction: 'lent', principal_cents: 100 })).error).not.toBeNull()
    expect((await A.db.from('budgets').insert({ user_id: A.id, category_id: cat!.id, amount_cents: 1000 })).error).not.toBeNull()
    await resetUser(A.id, 'plus')
    expect((await A.db.from('loans').insert({ user_id: A.id, account_id: accA, counterparty: 'TESTE y', direction: 'lent', principal_cents: 100 })).error).toBeNull()
    expect((await A.db.from('budgets').insert({ user_id: A.id, category_id: cat!.id, amount_cents: 1000 })).error).not.toBeNull()
    await resetUser(A.id, 'pro_plan')
    expect((await A.db.from('budgets').insert({ user_id: A.id, category_id: cat!.id, amount_cents: 1000 })).error).toBeNull()
  })
})

test.describe('Sincronização entre dispositivos', () => {
  test('SYNC-01 o que um dispositivo grava o outro enxerga, inclusive a exclusão', async () => {
    await resetUser(A.id, 'premium')
    const device2 = await signedIn(USER_A) // 2º dispositivo = outra sessão do mesmo usuário
    await A.db.from('transactions').insert(tx(A.id, accA, 'SYNC-1'))
    expect((await device2.db.from('transactions').select('id').eq('description', 'SYNC-1')).data).toHaveLength(1)
    await device2.db.from('transactions').delete().eq('description', 'SYNC-1')
    expect((await A.db.from('transactions').select('id').eq('description', 'SYNC-1')).data).toHaveLength(0)
  })
})
