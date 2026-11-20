import { totalLiquidBalanceCents } from './accountTypes'
import { groupTransactionsByInvoice, transactionDueDate } from './invoices'
import type { Account, TransactionWithRelations } from '../types/database'

export interface ForecastEvent {
  date: string
  label: string
  cents: number // positivo entra, negativo sai
  /** 'estimate' = previsão de recorrência de valor variável (não é movimentação lançada) */
  kind: 'income' | 'expense' | 'invoice' | 'estimate'
}

export interface ForecastDay {
  date: string
  balanceCents: number
}

export interface Forecast {
  startCents: number
  endCents: number
  minCents: number
  minDate: string
  days: ForecastDay[]
  events: ForecastEvent[]
  /** primeiro dia em que o saldo previsto fica negativo, se houver */
  firstNegativeDate: string | null
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Saldo previsto dia a dia de hoje até `endDate`, a partir do saldo atual (sem cartão) e do que
 * ainda está em aberto: contas a pagar/receber pelo vencimento efetivo (vencido entra hoje) e
 * faturas de cartão ainda não pagas, no vencimento da fatura. Transferências e empréstimos não
 * entram: só movem dinheiro entre contas / são informativos.
 */
export function computeForecast(
  accounts: Account[],
  transactions: TransactionWithRelations[],
  paidInvoices: { to_account_id: string; invoice_period: string | null }[],
  today: string,
  endDate: string,
  /** estimativas (ex.: recorrências de valor variável) somadas à previsão; nunca viram movimentação */
  estimates: ForecastEvent[] = []
): Forecast {
  const active = accounts.filter((a) => !a.archived)
  const events: ForecastEvent[] = []
  const clamp = (d: string) => (d < today ? today : d)

  for (const t of transactions) {
    if (t.applied_to_balance || t.account?.type === 'credit_card') continue
    const date = clamp(transactionDueDate(t, t.account))
    if (date > endDate) continue
    events.push({
      date,
      label: t.description,
      cents: t.type === 'income' ? t.amount_cents : -t.amount_cents,
      kind: t.type === 'income' ? 'income' : 'expense',
    })
  }

  for (const card of active.filter((a) => a.type === 'credit_card')) {
    const cardTx = transactions.filter((t) => t.account_id === card.id)
    for (const g of groupTransactionsByInvoice(cardTx, card)) {
      if (!g.dueDate || g.totalCents <= 0) continue
      if (paidInvoices.some((p) => p.to_account_id === card.id && p.invoice_period === g.period)) continue
      const date = clamp(g.dueDate)
      if (date > endDate) continue
      events.push({ date, label: `Fatura ${card.name}`, cents: -g.totalCents, kind: 'invoice' })
    }
  }

  events.push(...estimates)
  events.sort((a, b) => a.date.localeCompare(b.date))

  const startCents = totalLiquidBalanceCents(active)
  const days: ForecastDay[] = []
  let balance = startCents
  let minCents = startCents
  let minDate = today
  let firstNegativeDate: string | null = startCents < 0 ? today : null
  for (let d = today; d <= endDate; d = addDays(d, 1)) {
    for (const e of events) if (e.date === d) balance += e.cents
    days.push({ date: d, balanceCents: balance })
    if (balance < minCents) {
      minCents = balance
      minDate = d
    }
    if (balance < 0 && !firstNegativeDate) firstNegativeDate = d
  }

  return { startCents, endCents: balance, minCents, minDate, days, events, firstNegativeDate }
}
