import { currentInvoicePeriod, groupTransactionsByInvoice } from './invoices'
import { todayISO } from './format'
import type { Account, AccountType, TransactionWithRelations } from '../types/database'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  wallet: 'Carteira',
  investment: 'Investimento',
}

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'checking', label: ACCOUNT_TYPE_LABELS.checking },
  { value: 'savings', label: ACCOUNT_TYPE_LABELS.savings },
  { value: 'credit_card', label: ACCOUNT_TYPE_LABELS.credit_card },
  { value: 'wallet', label: ACCOUNT_TYPE_LABELS.wallet },
  { value: 'investment', label: ACCOUNT_TYPE_LABELS.investment },
]

/** Saldo total "disponível": cartão de crédito é fatura (dívida do mês), não soma no saldo líquido. */
export function totalLiquidBalanceCents(accounts: Account[]): number {
  return accounts.filter((a) => a.type !== 'credit_card').reduce((sum, a) => sum + a.balance_cents, 0)
}

/** Soma das despesas do mês corrente para uma conta — fallback para cartões sem fechamento cadastrado. */
export function currentMonthExpenseByAccount(
  transactions: TransactionWithRelations[],
  referenceDate = new Date()
): Map<string, number> {
  const monthKey = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date.slice(0, 7) !== monthKey) continue
    map.set(t.account_id, (map.get(t.account_id) ?? 0) + t.amount_cents)
  }
  return map
}

export interface CurrentInvoiceInfo {
  totalCents: number
  dueDate: string | null
}

/** Fatura atual de cada cartão: usa fechamento/vencimento reais quando cadastrados,
 * senão cai para o total do mês civil (currentMonthExpenseByAccount). */
export function currentInvoiceByAccount(
  transactions: TransactionWithRelations[],
  accounts: Account[]
): Map<string, CurrentInvoiceInfo> {
  const fallback = currentMonthExpenseByAccount(transactions)
  const map = new Map<string, CurrentInvoiceInfo>()
  for (const acc of accounts) {
    if (acc.type !== 'credit_card') continue
    if (!acc.closing_day) {
      map.set(acc.id, { totalCents: fallback.get(acc.id) ?? 0, dueDate: null })
      continue
    }
    // A fatura só sai do card DEPOIS do vencimento: depois do fechamento ela continua aparecendo
    // (mesmo com o ciclo novo já aberto) até a data de vencimento passar. Se nenhuma fatura
    // ainda vai vencer, cai para a fatura do ciclo atual.
    const today = todayISO()
    const groups = groupTransactionsByInvoice(transactions, acc)
    const upcoming = groups
      .filter((g) => g.dueDate && g.dueDate >= today && g.totalCents > 0)
      .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))[0]
    const currentPeriod = currentInvoicePeriod(acc.closing_day)
    const current = upcoming ?? groups.find((g) => g.period === currentPeriod)
    map.set(acc.id, { totalCents: current?.totalCents ?? 0, dueDate: current?.dueDate ?? null })
  }
  return map
}
