import type { TransactionWithRelations, Account } from '../types/database'

/**
 * Em qual fatura (período "YYYY-MM" = mês em que a fatura FECHA) uma compra cai, dado o dia de fechamento.
 * Compra ANTES do dia de fechamento entra na fatura que fecha neste mês; compra NO dia do fechamento ou depois
 * já entra na fatura seguinte. Ex.: fechamento dia 1 → tudo de 01/10 a 31/10 cai na fatura que fecha em 01/11.
 */
export function getInvoicePeriod(dateStr: string, closingDay: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (d < closingDay) return `${y}-${String(m).padStart(2, '0')}`
  const next = new Date(y, m, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

/** Data de vencimento (YYYY-MM-DD) de uma fatura, respeitando fechamento e vencimento do cartão. */
export function getInvoiceDueDate(period: string, closingDay: number, dueDay: number): string {
  const [y, m] = period.split('-').map(Number)
  const monthOffset = dueDay <= closingDay ? 1 : 0
  const d = new Date(y, m - 1 + monthOffset, dueDay)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function invoicePeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentInvoicePeriod(closingDay: number, referenceDate = new Date()): string {
  const dateStr = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(referenceDate.getDate()).padStart(2, '0')}`
  return getInvoicePeriod(dateStr, closingDay)
}

/**
 * Data de vencimento "efetiva" de uma movimentação, em ordem de prioridade:
 * 1. `due_date` explícito na movimentação (campo "Vencimento" do formulário), se houver;
 * 2. para compra no cartão de crédito, o vencimento da fatura em que ela cai (fechamento/
 *    vencimento cadastrados no cartão) — nunca a data da compra;
 * 3. senão, a própria `date` da movimentação.
 */
export function transactionDueDate(
  transaction: { date: string; due_date?: string | null },
  account: Pick<Account, 'type' | 'closing_day' | 'due_day'> | null | undefined
): string {
  if (transaction.due_date) return transaction.due_date
  if (account?.type === 'credit_card' && account.closing_day && account.due_day) {
    const period = getInvoicePeriod(transaction.date, account.closing_day)
    return getInvoiceDueDate(period, account.closing_day, account.due_day)
  }
  return transaction.date
}

/**
 * Movimentação "quitada" (sai da lista de Movimentações e vai para Relatórios):
 * - conta comum: já confirmada (applied_to_balance);
 * - compra no cartão de crédito: a fatura em que ela cai já foi paga (existe transfer com o
 *   invoice_period dela para aquele cartão) — não há quitação por compra individual.
 */
export function isTransactionSettled(
  transaction: TransactionWithRelations,
  transfers: { to_account_id: string; invoice_period: string | null }[]
): boolean {
  const account = transaction.account
  if (account?.type === 'credit_card') {
    const period = account.closing_day
      ? getInvoicePeriod(transaction.date, account.closing_day)
      : transaction.date.slice(0, 7)
    return transfers.some((t) => t.to_account_id === transaction.account_id && t.invoice_period === period)
  }
  return transaction.applied_to_balance
}

export interface InvoiceGroup {
  period: string
  dueDate: string | null
  totalCents: number
  purchases: TransactionWithRelations[]
}

/** Agrupa as compras de um cartão em faturas, usando o fechamento/vencimento cadastrados.
 * Sem fechamento cadastrado, cai de volta para "mês civil da compra" (comportamento antigo). */
export function groupTransactionsByInvoice(
  transactions: TransactionWithRelations[],
  account: Account
): InvoiceGroup[] {
  const groups = new Map<string, TransactionWithRelations[]>()
  for (const t of transactions) {
    if (t.account_id !== account.id || t.type !== 'expense') continue
    const period = account.closing_day ? getInvoicePeriod(t.date, account.closing_day) : t.date.slice(0, 7)
    const list = groups.get(period) ?? []
    list.push(t)
    groups.set(period, list)
  }
  return Array.from(groups.entries())
    .map(([period, purchases]) => ({
      period,
      dueDate:
        account.closing_day && account.due_day
          ? getInvoiceDueDate(period, account.closing_day, account.due_day)
          : null,
      totalCents: purchases.reduce((sum, p) => sum + p.amount_cents, 0),
      purchases: purchases.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => a.period.localeCompare(b.period))
}
