// POST /api/push-subscribe  { endpoint, keys: { p256dh, auth } } -> registra este aparelho para o usuário logado.
// Feito pelo servidor porque o mesmo aparelho pode trocar de conta: o endpoint passa a ser de quem está logado agora.
import { adminClient, getUser } from './_lib/billing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login novamente.' })

  const { endpoint, keys } = req.body || {}
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Inscrição inválida.' })
  }
  const { error } = await adminClient()
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 200),
      },
      { onConflict: 'endpoint' }
    )
  if (error) return res.status(500).json({ error: 'Não foi possível salvar a inscrição.' })
  return res.status(200).json({ ok: true })
}
