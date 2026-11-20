// POST /api/account-delete  — o usuário logado exclui a PRÓPRIA conta e todos os seus dados (LGPD, direito de exclusão).
// Autenticado pelo token de login do usuário (Authorization: Bearer ...). Exige a palavra de confirmação "EXCLUIR".
// Apagar o usuário em auth.users remove em cascata perfil, contas, movimentações, metas, empréstimos, orçamentos,
// recorrências, notificações e histórico da assistente (as tabelas referenciam auth.users com ON DELETE CASCADE).
import { adminClient, getUser } from './_lib/billing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_URL) {
    return res.status(503).json({ error: 'Exclusão de conta em configuração.' })
  }

  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Faça login novamente para excluir a conta.' })

  if (String(req.body?.confirm || '') !== 'EXCLUIR') {
    return res.status(400).json({ error: 'Digite EXCLUIR para confirmar.' })
  }

  try {
    const db = adminClient()
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role === 'admin') {
      // evita ficar sem nenhum administrador por engano; admin é removido pelo painel do banco
      return res.status(403).json({ error: 'Contas de administrador não podem ser excluídas por aqui.' })
    }

    // compra feita com este e-mail e ainda não aplicada a nenhuma conta
    const email = String(user.email || '').trim().toLowerCase()
    if (email) await db.from('billing_pending').delete().eq('email', email)

    const { error } = await db.auth.admin.deleteUser(user.id)
    if (error) return res.status(500).json({ error: 'Não foi possível excluir agora. Tente de novo em instantes.' })
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Não foi possível excluir agora. Tente de novo em instantes.' })
  }
}
