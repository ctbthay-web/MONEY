// POST /api/billing-sync  — "Conferir pagamento": o app pergunta à API da Kiwify se existe venda PAGA para a conta logada.
// É uma rede de segurança do webhook (api/kiwify-webhook): se o aviso automático não chegou ou foi ligado a outra conta,
// o usuário pode conferir o pagamento sem pagar de novo. Autenticado pelo token de login (Authorization: Bearer ...).
// Credenciais da API (Vercel): client_id, client_secret, account_id (ou KIWIFY_CLIENT_ID / KIWIFY_CLIENT_SECRET / KIWIFY_ACCOUNT_ID).
import { adminClient, getUser, addOneMonth } from './_lib/billing.js'

const API = 'https://public-api.kiwify.com/v1'

// mesmas regras do webhook: nome do plano na Kiwify → plano do app
const PLAN_BY_NAME = { start: 'start', plus: 'plus', pro: 'pro_plan', premium: 'premium' }
const PLAN_ENV = { start: 'KIWIFY_PRODUCT_START', plus: 'KIWIFY_PRODUCT_PLUS', pro_plan: 'KIWIFY_PRODUCT_PRO', premium: 'KIWIFY_PRODUCT_PREMIUM' }

function credentials() {
  const env = process.env
  const clientId = env.KIWIFY_CLIENT_ID || env.client_id
  const clientSecret = env.KIWIFY_CLIENT_SECRET || env.client_secret
  const accountId = env.KIWIFY_ACCOUNT_ID || env.account_id
  return clientId && clientSecret && accountId ? { clientId, clientSecret, accountId } : null
}

async function accessToken({ clientId, clientSecret }) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(`oauth ${res.status}`)
  return json.access_token
}

// a API não filtra por e-mail: lista as vendas dos últimos dias (no máximo 90) e filtramos aqui
function kiwifyDate(d) {
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

async function listSales(creds, token) {
  const end = new Date()
  const start = new Date(end.getTime() - 85 * 86_400_000)
  const sales = []
  for (let page = 1; page <= 5; page++) {
    const qs = new URLSearchParams({
      start_date: kiwifyDate(start),
      end_date: kiwifyDate(end),
      view_full_sale_details: 'true',
      page_size: '100',
      page_number: String(page),
    })
    const res = await fetch(`${API}/sales?${qs}`, { headers: { Authorization: `Bearer ${token}`, 'x-kiwify-account-id': creds.accountId } })
    if (!res.ok) throw new Error(`sales ${res.status}`)
    const json = await res.json()
    const data = Array.isArray(json?.data) ? json.data : []
    sales.push(...data)
    if (data.length < 100) break
  }
  return sales
}

// o detalhe de UMA venda traz product.plan_name (ex.: "START"); a lista pode não trazer
async function saleDetail(creds, token, id) {
  const res = await fetch(`${API}/sales/${id}`, { headers: { Authorization: `Bearer ${token}`, 'x-kiwify-account-id': creds.accountId } })
  return res.ok ? res.json().catch(() => null) : null
}

function planOf(sale) {
  const productId = sale?.product?.id
  for (const [plan, envName] of Object.entries(PLAN_ENV)) {
    if (process.env[envName] && productId && process.env[envName] === productId) return plan
  }
  const label = [sale?.product?.plan_name, sale?.subscription?.plan?.name, sale?.plan?.name, sale?.product?.plan?.name, sale?.offer?.name, sale?.product?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  for (const [name, plan] of Object.entries(PLAN_BY_NAME)) {
    if (new RegExp(`\\b${name}\\b`).test(label)) return plan
  }
  return null
}

const PAID = new Set(['paid', 'approved'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_URL) return res.status(503).json({ status: 'not_configured' })
  const creds = credentials()
  if (!creds) return res.status(503).json({ status: 'not_configured' })

  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login novamente.' })
  const email = String(user.email || '').trim().toLowerCase()
  if (!email || !user.email_confirmed_at) return res.status(200).json({ status: 'not_found' })

  try {
    const token = await accessToken(creds)
    const sales = await listSales(creds, token)
    // vendas pagas desta conta: o id da conta (s1) manda; sem s1, vale o e-mail. Venda com s1 de OUTRA conta nunca é reivindicada aqui.
    const mine = sales
      .filter((s) => PAID.has(String(s?.status || '').toLowerCase()))
      .filter((s) => {
        const s1 = String(s?.tracking?.s1 || '').trim().toLowerCase()
        if (s1) return s1 === user.id.toLowerCase()
        return String(s?.customer?.email || '').trim().toLowerCase() === email
      })
      .sort((a, b) => new Date(b.approved_date || b.created_at || 0) - new Date(a.approved_date || a.created_at || 0))

    console.log('[billing-sync]', JSON.stringify({ vendas: sales.length, daConta: mine.length }))
    const sale = mine[0]
    if (!sale) return res.status(200).json({ status: 'not_found' })

    const plan = planOf(sale) || planOf(await saleDetail(creds, token, sale.id))
    if (!plan) {
      console.log('[billing-sync] plano não identificado', JSON.stringify({ produto: sale.product?.name }))
      return res.status(200).json({ status: 'plan_unknown' })
    }

    const approved = new Date(sale.approved_date || sale.created_at || 0)
    const until = addOneMonth(approved)
    if (Number.isNaN(until.getTime()) || until <= new Date()) return res.status(200).json({ status: 'expired' })

    const db = adminClient()
    // mesma chave de idempotência do webhook: se o aviso automático já aplicou esta compra, não aplica de novo
    const { error: dup } = await db.from('billing_events').insert({ payment_id: `kiwify:${sale.id}:order_approved`, user_id: user.id, event: 'sync' })
    if (dup) return res.status(200).json({ status: 'already_applied', plan })

    const { data: profile } = await db.from('profiles').select('paid_until').eq('id', user.id).maybeSingle()
    const current = profile?.paid_until ? new Date(profile.paid_until) : null
    if (current && current >= until) return res.status(200).json({ status: 'already_applied', plan })

    await db
      .from('profiles')
      .update({ plan_id: plan, paid_until: until.toISOString(), billing_provider: 'kiwify', billing_status: 'active' })
      .eq('id', user.id)
    return res.status(200).json({ status: 'applied', plan })
  } catch (e) {
    console.log('[billing-sync] erro', String(e?.message || e))
    return res.status(502).json({ status: 'error' })
  }
}
