// Cria os usuários fictícios A e B no Supabase de HOMOLOGAÇÃO. NÃO TESTADO contra um Supabase real.
// Uso: node --env-file=.env.local scripts/seed-homologacao.mjs
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'vgwzmcvkrdmfqalnoukh'
const url = process.env.HOMOLOG_SUPABASE_URL
const key = process.env.HOMOLOG_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Defina HOMOLOG_SUPABASE_URL e HOMOLOG_SERVICE_ROLE_KEY.')
if (url.includes(PROD_REF) || url.includes(process.env.PROD_REF_EXTRA ?? '@@')) throw new Error('RECUSADO: esta URL é a de PRODUÇÃO.')
if (!/\.test$/.test(String(process.env.TEST_USER_A_EMAIL).split('@')[1] ?? '')) throw new Error('RECUSADO: use e-mails fictícios terminados em .test.')

const db = createClient(url, key, { auth: { persistSession: false } })
for (const [email, password] of [[process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD], [process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD]]) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error && !/already/i.test(error.message)) throw error
  const id = data?.user?.id ?? (await db.rpc('find_user_id_by_email', { p_email: email })).data
  // plano Start pago (ficticiamente) para exercitar limites; troque plan_id para testar os outros planos
  const { error: e2 } = await db.from('profiles').update({ plan_id: 'start', paid_until: new Date(Date.now() + 30 * 864e5).toISOString() }).eq('id', id)
  if (e2) throw e2
  console.log('usuário pronto:', email)
}
