// POST /api/billing-cancel  -> cancela a renovação; o acesso segue até paid_until
import { adminClient, asaas, billingConfigured, getUser } from './_lib/billing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!billingConfigured()) return res.status(503).json({ error: 'A cobrança ainda está sendo configurada.' })

  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login novamente.' })

  try {
    const db = adminClient()
    const { data: profile } = await db.from('profiles').select('billing_subscription_id').eq('id', user.id).single()
    if (!profile?.billing_subscription_id) return res.status(400).json({ error: 'Você não tem assinatura para cancelar.' })
    await asaas(`/subscriptions/${profile.billing_subscription_id}`, { method: 'DELETE' })
    await db.from('profiles').update({ billing_status: 'canceled' }).eq('id', user.id)
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Falha ao cancelar.' })
  }
}
