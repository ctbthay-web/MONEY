// POST /api/kiwify-webhook?signature=...  (FASE 2 — corrigido)
// Avisos da Kiwify: compra aprovada, renovação, atraso, cancelamento, reembolso/chargeback.
//
// O que mudou em relação à versão anterior:
//  1. Assinatura (HMAC-SHA1 hex do corpo, token KIWIFY_WEBHOOK_TOKEN, parâmetro "signature") é conferida
//     sobre o CORPO ORIGINAL (bytes recebidos). Só se a plataforma entregar o corpo já interpretado é que se
//     usa o JSON re-serializado (o formato citado na documentação da Kiwify). Comparação em tempo constante.
//  2. Ter order_id + e-mail NÃO basta: sem assinatura válida nada é processado, e a compra só libera acesso
//     com order_status "paid" (recusada/aguardando não libera).
//  3. A liberação é ATÔMICA no banco (kiwify_apply_grant, sql/027): o evento só é registrado como concluído
//     na mesma transação que libera o acesso. Qualquer falha → HTTP 500 → a Kiwify reenvia → reprocessa.
//  4. Idempotente: o mesmo evento reenviado não soma meses duas vezes.
//  5. Evento que não dá para aplicar (ex.: plano não mapeado) vai para billing_dead_letters e responde 500,
//     em vez de ser descartado com 200 (antes o cliente pagava e ficava sem acesso, sem nova tentativa).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { adminClient } from './_lib/billing.js'

export const config = { api: { bodyParser: false } } // precisamos dos bytes originais para conferir a assinatura

const PLAN_BY_NAME = { start: 'start', plus: 'plus', pro: 'pro_plan', premium: 'premium' }
const PLAN_ENV = { start: 'KIWIFY_PRODUCT_START', plus: 'KIWIFY_PRODUCT_PLUS', pro_plan: 'KIWIFY_PRODUCT_PRO', premium: 'KIWIFY_PRODUCT_PREMIUM' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return { raw: req.body, parsed: null }
  if (typeof req.body === 'string') return { raw: Buffer.from(req.body), parsed: null }
  if (req.body && typeof req.body === 'object') return { raw: null, parsed: req.body } // já interpretado pela plataforma
  const chunks = []
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return { raw: Buffer.concat(chunks), parsed: null }
}

function safeEqualHex(given, expected) {
  const a = Buffer.from(String(given).toLowerCase())
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Devolve 'raw' | 'reserialized' | null. */
export function verifySignature({ raw, parsed }, given, token) {
  if (!token || !given) return null
  if (raw && safeEqualHex(given, createHmac('sha1', token).update(raw).digest('hex'))) return 'raw'
  let obj = parsed
  if (!obj && raw) { try { obj = JSON.parse(raw.toString('utf8')) } catch { obj = null } }
  if (obj && safeEqualHex(given, createHmac('sha1', token).update(JSON.stringify(obj)).digest('hex'))) return 'reserialized'
  return null
}

export function resolvePlan(body, env = process.env) {
  const productId = body?.Product?.product_id || body?.product_id
  for (const [plan, envName] of Object.entries(PLAN_ENV)) {
    const wanted = env[envName]
    if (wanted && productId && wanted === productId) return plan
  }
  // A primeira cobrança é promocional e coincide com o preço cheio de outro plano: nunca decidir pelo valor.
  const label = `${body?.Subscription?.plan?.name || ''} ${body?.Product?.product_name || ''}`.toLowerCase()
  for (const [name, plan] of Object.entries(PLAN_BY_NAME)) {
    if (new RegExp(`\\b${name}\\b`).test(label)) return plan
  }
  return null
}

/** Lógica pura (testável): recebe um cliente com .rpc(name,args) e o corpo já validado. */
export async function processEvent(db, body, env = process.env) {
  const event = String(body.webhook_event_type || '')
  const status = String(body.order_status || '')
  const email = String(body.Customer?.email || '').trim().toLowerCase()
  const orderId = String(body.order_id || '').trim()
  const subscriptionId = body.subscription_id || body.Subscription?.id || null

  if (!orderId || orderId.length > 100 || !EMAIL_RE.test(email)) return { code: 200, json: { ignored: true, reason: 'dados incompletos' } }

  const grants = event === 'order_approved' || event === 'subscription_renewed' || (!event && status === 'paid')
  const revokes = event === 'order_refunded' || event === 'chargeback' || status === 'refunded' || status === 'chargedback'
  const late = event === 'subscription_late'
  const canceled = event === 'subscription_canceled'
  if (!grants && !revokes && !late && !canceled) return { code: 200, json: { ignored: true, reason: 'evento não tratado' } } // ex.: pagamento recusado

  const dead = (reason) => db.rpc('kiwify_dead_letter', { p_reason: reason, p_payload: body }).then(() => {}, () => {})

  if (grants) {
    if (status && status !== 'paid') return { code: 200, json: { ignored: true, reason: 'pagamento não aprovado' } }
    const plan = resolvePlan(body, env)
    if (!plan) {
      await dead('plano não identificado')
      return { code: 500, json: { error: 'Plano não identificado.' } } // a Kiwify reenvia; após mapear o produto o reenvio libera
    }
    const informed = body.Subscription?.customer_access?.access_until
    const informedDate = informed && !Number.isNaN(new Date(informed).getTime()) ? new Date(informed).toISOString() : null
    // Renovações de uma assinatura podem reutilizar o mesmo order_id: sem um carimbo POR COBRANÇA, a 2ª renovação
    // seria descartada como "duplicada". Só entram campos estáveis entre reenvios (nunca updated_at).
    // ATENÇÃO: confirmar com eventos reais do sandbox da Kiwify quais desses campos vêm preenchidos.
    const stamp = String(body.approved_date || body.Subscription?.next_payment || '').slice(0, 40)
    const { data, error } = await db.rpc('kiwify_apply_grant', {
      p_payment_id: `kiwify:${orderId}:${event || status}${stamp ? ':' + stamp : ''}`,
      p_event: event || status,
      p_email: email,
      p_plan: plan,
      p_informed: informedDate,
      p_sub: subscriptionId,
    })
    if (error) { await dead(`falha ao liberar: ${error.message}`); return { code: 500, json: { error: 'Erro ao processar.' } } }
    return { code: 200, json: { ok: true, result: data } }
  }

  const kind = revokes ? 'refund' : late ? 'late' : 'cancel'
  const { data, error } = await db.rpc('kiwify_apply_status', { p_kind: kind, p_email: email, p_sub: subscriptionId })
  if (error) { await dead(`falha em ${kind}: ${error.message}`); return { code: 500, json: { error: 'Erro ao processar.' } } }
  return { code: 200, json: { ok: true, result: data } }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!process.env.KIWIFY_WEBHOOK_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Cobrança em configuração.' })

  let body
  try {
    const parts = await readRawBody(req)
    const how = verifySignature(parts, String(req.query?.signature || ''), process.env.KIWIFY_WEBHOOK_TOKEN)
    if (!how) return res.status(401).json({ error: 'Não autorizado.' })
    if (how === 'reserialized') console.warn('[kiwify] assinatura validada pelo JSON re-serializado (não pelo corpo bruto)')
    body = parts.parsed ?? JSON.parse(parts.raw.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Corpo inválido.' })
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Corpo inválido.' })

  try {
    const { code, json } = await processEvent(adminClient(), body)
    return res.status(code).json(json)
  } catch (e) {
    console.error('[kiwify] erro inesperado', e?.message)
    return res.status(500).json({ error: 'Erro ao processar.' }) // a Kiwify tenta de novo
  }
}
