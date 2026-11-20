import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { USER_A, USER_B, SUPABASE_URL, SUPABASE_ANON } from './env'

/** Ref do Supabase de PRODUÇÃO: os testes recusam rodar contra ele. */
export const PROD_REF = 'vgwzmcvkrdmfqalnoukh'
export const SERVICE_KEY = process.env.HOMOLOG_SERVICE_ROLE_KEY ?? ''
export const READY = Boolean(SUPABASE_URL && SUPABASE_ANON && USER_A.email && USER_B.email && SERVICE_KEY)
export const BLOCKED_MSG = 'Bloqueado por dependência externa: crie o Supabase de HOMOLOGAÇÃO e preencha TEST_SUPABASE_URL/ANON_KEY, HOMOLOG_SERVICE_ROLE_KEY e os usuários A/B (veja homologacao/LEIA-ME.md).'

export function assertNotProduction() {
  if (SUPABASE_URL.includes(PROD_REF)) throw new Error('RECUSADO: TEST_SUPABASE_URL aponta para o Supabase de PRODUÇÃO.')
  if (!/\.test$/i.test(USER_A.email.split('@')[1] ?? '') || !/\.test$/i.test(USER_B.email.split('@')[1] ?? ''))
    throw new Error('RECUSADO: os usuários de teste devem ter e-mail fictício terminado em .test.')
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
export const anon = (): SupabaseClient => createClient(SUPABASE_URL, SUPABASE_ANON, opts)
export const admin = (): SupabaseClient => createClient(SUPABASE_URL, SERVICE_KEY, opts)

export async function signedIn(u: { email: string; password: string }): Promise<{ db: SupabaseClient; id: string }> {
  const db = anon()
  const { data, error } = await db.auth.signInWithPassword(u)
  if (error || !data.user) throw new Error('login de teste falhou: ' + (error?.message ?? 'sem usuário'))
  return { db, id: data.user.id }
}

/** Deixa o usuário no estado inicial: sem lançamentos de teste e com o plano pedido (via service role de HOMOLOGAÇÃO). */
export async function resetUser(id: string, plan: 'start' | 'plus' | 'pro_plan' | 'premium') {
  const a = admin()
  await a.from('transactions').delete().eq('user_id', id).not('description', 'like', '[HOMOLOG%')
  await a.from('loans').delete().eq('user_id', id).like('counterparty', 'TESTE%')
  await a.from('budgets').delete().eq('user_id', id)
  const { error } = await a.from('profiles').update({ plan_id: plan, paid_until: new Date(Date.now() + 30 * 864e5).toISOString(), is_lifetime: false }).eq('id', id)
  if (error) throw error
}

export async function firstAccount(db: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await db.from('accounts').select('id').eq('user_id', id).eq('type', 'checking').limit(1).single()
  if (error || !data) throw new Error('usuário sem conta corrente — rode o seed (90_seed_dados_ficticios.sql)')
  return data.id as string
}

export const tx = (user_id: string, account_id: string, description: string, extra: Record<string, unknown> = {}) =>
  ({ user_id, account_id, type: 'expense', amount_cents: 100, description, ...extra })
