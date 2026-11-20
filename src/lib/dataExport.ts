// "Exportar meus dados" (LGPD, portabilidade): junta tudo que o usuário tem no Money num único arquivo JSON.
// Lê pelas mesmas permissões do app (cada pessoa só enxerga os próprios dados), em páginas de 1000 linhas
// porque o servidor limita cada consulta a 1000 registros.
import { supabase } from './supabase'

const PAGE = 1000

/** tabela → coluna que identifica o dono */
const TABLES: { table: string; owner: string }[] = [
  { table: 'profiles', owner: 'id' },
  { table: 'accounts', owner: 'user_id' },
  { table: 'categories', owner: 'user_id' },
  { table: 'transactions', owner: 'user_id' },
  { table: 'transfers', owner: 'user_id' },
  { table: 'goals', owner: 'user_id' },
  { table: 'goal_contributions', owner: 'user_id' },
  { table: 'loans', owner: 'user_id' },
  { table: 'loan_payments', owner: 'user_id' },
  { table: 'budgets', owner: 'user_id' },
  { table: 'recurrences', owner: 'user_id' },
  { table: 'notification_preferences', owner: 'user_id' },
  { table: 'notification_schedules', owner: 'user_id' },
  { table: 'ai_conversations', owner: 'user_id' },
  { table: 'ai_messages', owner: 'user_id' },
]

async function fetchAll(table: string, owner: string, userId: string): Promise<{ rows: unknown[]; missing: boolean }> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(owner, userId)
      .order(owner === 'id' ? 'id' : 'created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      // tabela que ainda não existe neste banco (migração não aplicada) não impede o resto da exportação
      return { rows, missing: rows.length === 0 }
    }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return { rows, missing: false }
}

export interface ExportResult {
  filename: string
  json: string
  counts: Record<string, number>
}

export async function buildExport(user: { id: string; email?: string | null }): Promise<ExportResult> {
  const out: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const { table, owner } of TABLES) {
    const { rows, missing } = await fetchAll(table, owner, user.id)
    if (missing) continue
    out[table] = rows
    counts[table] = rows.length
  }
  const payload = {
    app: 'Money',
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null },
    note: 'Todos os valores em dinheiro estão em centavos (ex.: 1990 = R$ 19,90).',
    data: out,
  }
  const day = new Date().toISOString().slice(0, 10)
  return { filename: `money-meus-dados-${day}.json`, json: JSON.stringify(payload, null, 2), counts }
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
