// POST /api/billing-refund — reembolso automático pela API da Kiwify (POST /sales/{id}/refund).
// Corpo {} = só consulta se a conta pode ter reembolso automático; { confirm: true } = faz o reembolso.
// Regras (o dinheiro sai da conta da vendedora, então são travas de propósito):
//   - última venda PAGA desta conta, aprovada há no máximo 7 dias (direito de arrependimento, CDC art. 49);
//   - só cartão ou Pix (boleto precisa de dados bancários: vai para o suporte);
//   - um reembolso por pessoa: se já houve reembolso/chargeback (banco ou vendas da Kiwify dos últimos 85 dias), vai para o suporte.
// Reembolsar uma cobrança de assinatura também CANCELA a assinatura na Kiwify (docs: webhooks/receiving).
// O webhook order_refunded tira o acesso; aqui o acesso já é encerrado na hora, para a tela atualizar sem esperar.
import { adminClient, getUser } from './_lib/billing.js'
import { API, accessToken, authHeaders, credentials, listSales, saleTime, salesOfUser } from './_lib/kiwify.js'

const WINDOW_DAYS = 7
const PAID = new Set(['paid', 'approved'])
const REFUNDED = new Set(['refunded', 'chargedback', 'chargeback'])
const AUTO_METHODS = new Set(['credit_card', 'pix'])
const PAST_REFUND_EVENTS = ['order_refunded', 'refunded', 'chargeback', 'chargedback', 'refund_request']
const lc = (v) => String(v || '').toLowerCase()

export async function eligibility(db, user, sales) {
  const mine = salesOfUser(sales, user)
  const { data: past } = await db.from('billing_events').select('event').eq('user_id', user.id).in('event', PAST_REFUND_EVENTS)
  if ((past?.length ?? 0) > 0 || mine.some((s) => REFUNDED.has(lc(s.status)) || s.refunded_at)) {
    return { eligible: false, reason: 'already_refunded' }
  }
  const sale = mine.filter((s) => PAID.has(lc(s.status))).sort((a, b) => saleTime(b) - saleTime(a))[0]
  if (!sale) return { eligible: false, reason: 'no_sale' }
  const approvedMs = saleTime(sale)
  const deadline = new Date(approvedMs + WINDOW_DAYS * 86_400_000)
  if (!approvedMs || deadline <= new Date()) return { eligible: false, reason: 'expired', deadline }
  if (!AUTO_METHODS.has(lc(sale.payment_method))) return { eligible: false, reason: 'method' }
  const amount = Number(sale.payment?.charge_amount ?? sale.charge_amount)
  return { eligible: true, sale, deadline, amountCents: Number.isFinite(amount) ? amount : null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  const creds = credentials()
  if (!creds || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ eligible: false, reason: 'not_configured' })

  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login novamente.' })
  if (!user.email_confirmed_at) return res.status(200).json({ eligible: false, reason: 'no_sale' })

  const confirm = req.body?.confirm === true
  const db = adminClient()
  try {
    const token = await accessToken(creds)
    const e = await eligibility(db, user, await listSales(creds, token))
    if (!confirm || !e.eligible) {
      return res.status(confirm ? 409 : 200).json({
        eligible: e.eligible,
        reason: e.reason ?? null,
        amount_cents: e.amountCents ?? null,
        deadline: e.deadline ? e.deadline.toISOString() : null,
      })
    }

    // trava: a chave única impede dois reembolsos da mesma venda (clique duplo, duas abas)
    const lockId = `kiwify:${e.sale.id}:refund_request`
    const { error: dup } = await db.from('billing_events').insert({ payment_id: lockId, user_id: user.id, event: 'refund_request' })
    if (dup) return res.status(409).json({ eligible: false, reason: 'already_refunded' })

    const r = await fetch(`${API}/sales/${e.sale.id}/refund`, {
      method: 'POST',
      headers: { ...authHeaders(creds, token), 'Content-Type': 'application/json' },
      body: '{}',
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json?.refunded !== true) {
      // libera a trava para o suporte (ou uma nova tentativa) poder resolver
      await db.from('billing_events').delete().eq('payment_id', lockId)
      console.log('[billing-refund] falhou', JSON.stringify({ status: r.status, error: json?.error, message: json?.message }))
      return res.status(502).json({ eligible: false, reason: 'refund_failed' })
    }

    await db.from('profiles').update({ paid_until: new Date().toISOString(), billing_status: 'refunded' }).eq('id', user.id)
    console.log('[billing-refund] ok', JSON.stringify({ sale: e.sale.id }))
    return res.status(200).json({ refunded: true })
  } catch (err) {
    console.log('[billing-refund] erro', String(err?.message || err))
    return res.status(502).json({ eligible: false, reason: 'error' })
  }
}
