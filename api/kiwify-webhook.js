// POST /api/kiwify-webhook?signature=...  — avisos da Kiwify (compra aprovada, renovação, atraso,
// cancelamento, reembolso). Autenticado pela assinatura: HMAC-SHA1 (hex) do corpo JSON usando o
// token do webhook (KIWIFY_WEBHOOK_TOKEN), enviada pela Kiwify no parâmetro "signature".
import { createHmac, timingSafeEqual } from 'node:crypto'
import { adminClient, addOneMonth } from './_lib/billing.js'

// nome do plano na Kiwify → plano do app; usado quando o produto não está mapeado por variável de ambiente
const PLAN_BY_NAME = { start: 'start', plus: 'plus', pro: 'pro_plan', premium: 'premium' }
const PLAN_ENV = {
  start: 'KIWIFY_PRODUCT_START',
  plus: 'KIWIFY_PRODUCT_PLUS',
  pro_plan: 'KIWIFY_PRODUCT_PRO',
  premium: 'KIWIFY_PRODUCT_PREMIUM',
}

// Recebemos o corpo CRU (sem o parse automático da Vercel): a Kiwify assina os bytes exatos que enviou, e
// reserializar o JSON pode mudar escapes/ordem e quebrar a assinatura (ver docs.kiwify.com.br → Receber e validar webhooks).
export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return null // já veio interpretado: cai no JSON.stringify
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function signatureOf(req) {
  if (req.query && req.query.signature !== undefined) return String(req.query.signature || '')
  try {
    return new URL(req.url || '', 'http://local').searchParams.get('signature') || ''
  } catch {
    return ''
  }
}

function validSignature(req, signedText) {
  const token = process.env.KIWIFY_WEBHOOK_TOKEN
  const given = signatureOf(req)
  if (!token || !given) return false
  const expected = createHmac('sha1', token).update(signedText).digest('hex')
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Conta (id) que abriu o pagamento: o app coloca o id do usuário no parâmetro s1 do link da Kiwify. */
function trackedUserId(body) {
  const t = body?.TrackingParameters || body?.tracking || body?.Tracking || {}
  const v = String(t.s1 || '').trim()
  return UUID.test(v) ? v.toLowerCase() : null
}

function resolvePlan(body) {
  const productId = body?.Product?.product_id || body?.product_id
  for (const [plan, envName] of Object.entries(PLAN_ENV)) {
    const wanted = process.env[envName]
    if (wanted && productId && wanted === productId) return plan
  }
  // plano de assinatura da Kiwify (START/PLUS/PRO/PREMIUM) ou nome do produto. Não dá para usar o
  // valor cobrado: a primeira cobrança é promocional e coincide com o preço cheio de outro plano.
  const label = `${body?.Subscription?.plan?.name || ''} ${body?.Product?.product_name || ''}`.toLowerCase()
  for (const [name, plan] of Object.entries(PLAN_BY_NAME)) {
    if (new RegExp(`\\b${name}\\b`).test(label)) return plan
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!process.env.KIWIFY_WEBHOOK_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Cobrança em configuração.' })
  }
  let raw
  try {
    raw = await readRawBody(req)
  } catch {
    return res.status(400).json({ error: 'Corpo inválido.' })
  }
  const signedText = raw === null ? JSON.stringify(req.body ?? {}) : raw
  if (!validSignature(req, signedText)) return res.status(401).json({ error: 'Não autorizado.' })

  let body
  try {
    body = raw === null ? req.body || {} : JSON.parse(raw || '{}')
  } catch {
    return res.status(400).json({ error: 'JSON inválido.' })
  }
  const event = String(body.webhook_event_type || '')
  const status = String(body.order_status || '')
  const email = String(body.Customer?.email || '').trim().toLowerCase()
  const orderId = String(body.order_id || '')
  const subscriptionId = body.subscription_id || body.Subscription?.id || null
  if (!email || !orderId) return res.status(200).json({ ignored: true })

  const grants = event === 'order_approved' || event === 'subscription_renewed' || (!event && status === 'paid')
  const revokes = event === 'order_refunded' || event === 'chargeback' || status === 'refunded' || status === 'chargedback'
  const late = event === 'subscription_late'
  const canceled = event === 'subscription_canceled'
  if (!grants && !revokes && !late && !canceled) return res.status(200).json({ ignored: true })

  try {
    const db = adminClient()
    // 1º: a conta que abriu o pagamento (s1 = id do usuário no link do app). Vale mesmo se a pessoa digitou outro
    // e-mail na Kiwify e não depende de quem cadastrou aquele e-mail. 2º (compra sem s1, ex.: link direto): pelo e-mail.
    let userId = null
    const tracked = trackedUserId(body)
    if (tracked) {
      const { data: owner } = await db.from('profiles').select('id').eq('id', tracked).maybeSingle()
      if (owner?.id) userId = owner.id
    }
    if (!userId) {
      const { data: byEmail } = await db.rpc('find_user_id_by_email', { p_email: email })
      userId = byEmail || null
    }

    if (grants) {
      const plan = resolvePlan(body)
      if (!plan) return res.status(200).json({ ignored: true, reason: 'plano não identificado' })

      // fim do acesso: o que a Kiwify informar; senão, 1 mês a partir do maior entre agora e o já pago
      const informed = body.Subscription?.customer_access?.access_until
      const informedDate = informed ? new Date(informed) : null

      if (!userId) {
        // comprou antes de criar a conta: guarda e aplica quando o e-mail se cadastrar
        const until = informedDate && informedDate > new Date() ? informedDate : addOneMonth(new Date())
        await db.from('billing_pending').upsert({
          email,
          plan_id: plan,
          paid_until: until.toISOString(),
          billing_provider: 'kiwify',
          billing_subscription_id: subscriptionId,
        })
        return res.status(200).json({ pending: true })
      }

      // idempotência: a Kiwify pode reenviar o mesmo aviso
      const { error: dup } = await db.from('billing_events').insert({ payment_id: `kiwify:${orderId}:${event || status}`, user_id: userId, event: event || status })
      if (dup) return res.status(200).json({ duplicate: true })

      const { data: profile } = await db.from('profiles').select('paid_until').eq('id', userId).maybeSingle()
      const now = new Date()
      const base = new Date(Math.max(now.getTime(), new Date(profile?.paid_until || 0).getTime()))
      const until = informedDate && informedDate > now ? informedDate : addOneMonth(base)
      await db
        .from('profiles')
        .update({
          plan_id: plan,
          paid_until: until.toISOString(),
          billing_provider: 'kiwify',
          billing_subscription_id: subscriptionId,
          billing_status: 'active',
        })
        .eq('id', userId)
      return res.status(200).json({ ok: true })
    }

    if (!userId) {
      if (revokes) await db.from('billing_pending').delete().eq('email', email)
      return res.status(200).json({ ignored: true })
    }

    // Upgrade/troca de plano cria uma assinatura nova na Kiwify; avisos da assinatura ANTIGA (cancelada,
    // atrasada, reembolsada) não podem derrubar o plano novo que já está valendo.
    const { data: current } = await db.from('profiles').select('billing_subscription_id').eq('id', userId).maybeSingle()
    if (subscriptionId && current?.billing_subscription_id && current.billing_subscription_id !== subscriptionId) {
      return res.status(200).json({ ignored: true, reason: 'assinatura antiga' })
    }

    if (revokes) {
      await db.from('profiles').update({ paid_until: new Date().toISOString(), billing_status: 'refunded' }).eq('id', userId)
    } else if (late) {
      await db.from('profiles').update({ billing_status: 'past_due' }).eq('id', userId)
    } else if (canceled) {
      await db.from('profiles').update({ billing_status: 'canceled' }).eq('id', userId)
    }
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Erro ao processar.' }) // a Kiwify tenta de novo
  }
}
