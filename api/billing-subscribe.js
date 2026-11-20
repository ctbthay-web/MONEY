// POST /api/billing-subscribe  { cpfCnpj }  -> { url }  (fatura do Asaas para pagar)
import { PLAN_VALUE, adminClient, asaas, billingConfigured, getUser, isoDay } from './_lib/billing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!billingConfigured()) return res.status(503).json({ error: 'A cobrança ainda está sendo configurada. Tente novamente em breve.' })

  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login novamente.' })

  const cpfCnpj = String(req.body?.cpfCnpj || '').replace(/\D/g, '')
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) return res.status(400).json({ error: 'Informe um CPF ou CNPJ válido.' })

  try {
    const db = adminClient()
    const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single()
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado.' })
    if (profile.is_lifetime || profile.role === 'admin') return res.status(400).json({ error: 'Sua conta não precisa de assinatura.' })

    // cliente no Asaas (reaproveita se já existe)
    let customerId = profile.billing_customer_id
    if (customerId) {
      await asaas(`/customers/${customerId}`, { method: 'PUT', body: { cpfCnpj } })
    } else {
      const customer = await asaas('/customers', {
        method: 'POST',
        body: { name: profile.full_name || user.email, email: user.email, cpfCnpj, externalReference: user.id },
      })
      customerId = customer.id
    }

    // assinatura: se ainda em teste, a 1ª cobrança vence no fim do teste (pode pagar antes)
    let subscriptionId = profile.billing_subscription_id
    if (!subscriptionId || profile.billing_status === 'canceled') {
      const trialEnd = profile.trial_ends_at ? new Date(profile.trial_ends_at) : new Date()
      const due = trialEnd > new Date() ? trialEnd : new Date()
      const sub = await asaas('/subscriptions', {
        method: 'POST',
        body: {
          customer: customerId,
          billingType: 'UNDEFINED',
          value: PLAN_VALUE,
          nextDueDate: isoDay(due),
          cycle: 'MONTHLY',
          description: 'Money — plano mensal',
          externalReference: user.id,
        },
      })
      subscriptionId = sub.id
    }

    await db
      .from('profiles')
      .update({
        billing_provider: 'asaas',
        billing_customer_id: customerId,
        billing_subscription_id: subscriptionId,
        billing_status: profile.billing_status === 'active' ? 'active' : 'pending',
      })
      .eq('id', user.id)

    // fatura em aberto da assinatura (onde a pessoa escolhe Pix, cartão ou boleto)
    // o Asaas pode levar alguns segundos para gerar a 1ª cobrança da assinatura
    let url
    for (let i = 0; i < 4 && !url; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500))
      const list = await asaas(`/subscriptions/${subscriptionId}/payments?status=PENDING`)
      url = list?.data?.[0]?.invoiceUrl
    }
    if (!url) return res.status(409).json({ error: 'Não há fatura em aberto. Se você já pagou, aguarde alguns minutos.' })
    return res.status(200).json({ url })
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Falha ao falar com o Asaas.' })
  }
}
