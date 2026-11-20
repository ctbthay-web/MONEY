import { test, expect } from '../../fixtures/base'
import { hasTwoUsers, hasSupabase, USER_A, USER_B, SUPABASE_URL, SUPABASE_ANON } from '../../helpers/env'

test.describe('RLS com dois usuários (somente projeto de TESTE)', () => {
  test.skip(!(hasTwoUsers && hasSupabase), 'Não executado: defina TEST_USER_A/B_* e TEST_SUPABASE_URL/ANON_KEY (projeto de teste).')
  test('SEC-RLS-01 usuário B não lê nem altera dados do usuário A', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const a = createClient(SUPABASE_URL, SUPABASE_ANON); const b = createClient(SUPABASE_URL, SUPABASE_ANON)
    await a.auth.signInWithPassword(USER_A); await b.auth.signInWithPassword(USER_B)
    const { data: acc } = await a.from('accounts').select('id').limit(1)
    test.skip(!acc?.length, 'Usuário A precisa de ao menos 1 conta')
    const id = acc![0].id
    expect((await b.from('accounts').select('*').eq('id', id)).data).toEqual([])
    const upd = await b.from('accounts').update({ name: 'hack' }).eq('id', id).select()
    expect(upd.data ?? []).toEqual([])
    const ins = await b.from('transactions').insert({ account_id: id, type: 'expense', amount_cents: 100, description: 'x', date: '2026-01-01' })
    expect(ins.error).not.toBeNull() // a0_check_ownership deve bloquear
  })
  test('SEC-QUOTA-01 created_at forjado não burla a cota (ALTA-01)', async () => {
    test.fixme(true, 'Escrever após definir conta Start no ambiente de teste: inserir > limite com created_at antigo e exigir erro.')
  })
})
