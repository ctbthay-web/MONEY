import { formatCentsToBRL, safeRatio } from './format'
import type { Account, TransactionWithRelations } from '../types/database'

export interface Insight {
  id: string
  tone: 'brand' | 'danger' | 'neutral'
  text: string
}

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7)
}

/**
 * Observações computadas a partir de dados reais — nunca inventadas. Cada insight só é
 * incluído quando há dado suficiente para sustentá-lo (ex: não compara com o mês anterior
 * se não existe mês anterior).
 */
export function computeInsights(
  transactions: TransactionWithRelations[],
  accounts: Account[],
  currentMonthKey: string,
  previousMonthKey: string
): Insight[] {
  const insights: Insight[] = []

  // 1. Fatura de cartão perto do limite — o mais urgente, entra primeiro.
  for (const acc of accounts) {
    if (acc.type !== 'credit_card' || !acc.credit_limit_cents) continue
    const spent = transactions
      .filter((t) => t.account_id === acc.id && t.type === 'expense' && monthKey(t.date) === currentMonthKey)
      .reduce((sum, t) => sum + t.amount_cents, 0)
    const ratio = safeRatio(spent, acc.credit_limit_cents)
    if (ratio >= 0.7) {
      insights.push({
        id: `limit-${acc.id}`,
        tone: ratio >= 0.9 ? 'danger' : 'neutral',
        text: `Fatura do ${acc.name} já usa ${Math.round(ratio * 100)}% do limite (${formatCentsToBRL(spent)} de ${formatCentsToBRL(acc.credit_limit_cents)}).`,
      })
    }
  }

  // 2. Categoria com maior aumento de gasto vs. mês anterior.
  const byCategory = (key: string) => {
    const map = new Map<string, { name: string; amount: number }>()
    for (const t of transactions) {
      if (t.type !== 'expense' || monthKey(t.date) !== key) continue
      const id = t.category?.id ?? 'none'
      const prev = map.get(id)
      map.set(id, { name: t.category?.name ?? 'Sem categoria', amount: (prev?.amount ?? 0) + t.amount_cents })
    }
    return map
  }
  const current = byCategory(currentMonthKey)
  const previous = byCategory(previousMonthKey)
  if (previous.size > 0) {
    let biggest: { name: string; delta: number } | null = null
    for (const [id, cur] of current) {
      const prevAmount = previous.get(id)?.amount ?? 0
      const delta = cur.amount - prevAmount
      if (delta > 0 && (!biggest || delta > biggest.delta)) biggest = { name: cur.name, delta }
    }
    if (biggest) {
      insights.push({
        id: 'category-mover',
        tone: 'neutral',
        text: `${biggest.name} foi o que mais subiu este mês: +${formatCentsToBRL(biggest.delta)} vs. mês anterior.`,
      })
    }
  }

  // 3. Assinaturas/recorrências ativas este mês.
  const recurring = transactions.filter(
    (t) => t.type === 'expense' && t.recurrence_frequency && monthKey(t.date) === currentMonthKey
  )
  if (recurring.length > 0) {
    const total = recurring.reduce((sum, t) => sum + t.amount_cents, 0)
    insights.push({
      id: 'recurring',
      tone: 'neutral',
      text: `${formatCentsToBRL(total)} em ${recurring.length} movimentação(ões) recorrente(s) este mês.`,
    })
  }

  // 4. Taxa de economia vs. mês anterior.
  const sumType = (key: string, type: 'income' | 'expense') =>
    transactions
      .filter((t) => t.type === type && monthKey(t.date) === key)
      .reduce((sum, t) => sum + t.amount_cents, 0)
  const curIncome = sumType(currentMonthKey, 'income')
  const prevIncome = sumType(previousMonthKey, 'income')
  if (curIncome > 0 && prevIncome > 0) {
    const curRate = safeRatio(curIncome - sumType(currentMonthKey, 'expense'), curIncome) * 100
    const prevRate = safeRatio(prevIncome - sumType(previousMonthKey, 'expense'), prevIncome) * 100
    const diff = Math.round(curRate - prevRate)
    if (Math.abs(diff) >= 3) {
      insights.push({
        id: 'savings-rate',
        tone: diff >= 0 ? 'brand' : 'danger',
        text: `Taxa de economia ${diff >= 0 ? 'subiu' : 'caiu'} ${Math.abs(diff)} pontos vs. mês anterior, agora em ${Math.round(curRate)}%.`,
      })
    }
  }

  return insights.slice(0, 3)
}
