// POST /api/billing-webhook  — avisos do Asaas (pagamento confirmado, atraso, cancelamento…)
// Autenticado pelo cabeçalho "asaas-access-token" (segredo configurado no Asaas e na Vercel).
import { adminClient, addOneMonth } from './_lib/billing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected || req.headers['asaas-access-token'] !== expected) return res.status(401).json({ error: 'Não autorizado.' })

  const { event, payment, subscription } = req.body || {}
  const subscriptionId = payment?.subscription || subscription?.id
  const customerId = payment?.customer || subscription?.customer
  if (!event || (!subscriptionId && !customerId)) return res.status(200).json({ ignored: true })

  try {
    const db = adminClient()
    let q = db.from('profiles').select('id, paid_until, trial_ends_at, billing_status')
    q = subscriptionId ? q.eq('billing_subscription_id', subscriptionId) : q.eq('billing_customer_id', customerId)
    const { data: profile } = await q.maybeSingle()
    if (!profile) return res.status(200).json({ ignored: true }) // não é de um usuário nosso

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      // idempotência: o mesmo pagamento só conta uma vez (CONFIRMED e RECEIVED chegam separados)
      const { error: dup } = await db.from('billing_events').insert({ payment_id: payment.id, user_id: profile.id, event })
      if (dup) return res.status(200).json({ duplicate: true })
      const now = new Date()
      const base = new Date(
        Math.max(now.getTime(), new Date(profile.paid_until || 0).getTime(), new Date(profile.trial_ends_at || 0).getTime())
      )
      await db.from('profiles').update({ paid_until: addOneMonth(base).toISOString(), billing_status: 'active' }).eq('id', profile.id)
    } else if (event === 'PAYMENT_OVERDUE') {
      await db.from('profiles').update({ billing_status: 'past_due' }).eq('id', profile.id)
    } else if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED') {
      await db.from('profiles').update({ paid_until: new Date().toISOString(), billing_status: 'refunded' }).eq('id', profile.id)
    } else if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
      await db.from('profiles').update({ billing_status: 'canceled' }).eq('id', profile.id)
    }
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Erro ao processar.' }) // o Asaas tenta de novo
  }
}
