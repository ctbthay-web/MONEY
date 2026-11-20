import type { MouseEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Repeat, Undo2 } from 'lucide-react'
import { resolveIcon } from '../../lib/icons'
import { formatCentsToBRL, formatDateShort, todayISO } from '../../lib/format'
import { transactionDueDate } from '../../lib/invoices'
import { useTransactionMutations } from '../../lib/queries/useTransactions'
import { useToast } from '../ui/Toast'
import type { TransactionWithRelations } from '../../types/database'

function statusLabel(transaction: TransactionWithRelations) {
  const isIncome = transaction.type === 'income'
  if (transaction.applied_to_balance) return isIncome ? 'Recebido' : 'Pago'
  if (transactionDueDate(transaction, transaction.account) < todayISO()) return isIncome ? 'Atrasado' : 'Vencido'
  return isIncome ? 'Receber' : 'Pagar'
}

function statusClasses(transaction: TransactionWithRelations) {
  if (transaction.applied_to_balance) return 'bg-brand-500/15 text-brand-300 border-brand-500/25'
  if (transactionDueDate(transaction, transaction.account) < todayISO()) return 'bg-danger-soft text-danger border-danger/25'
  return 'bg-warning/10 text-warning border-warning/25'
}

function dateLabel(transaction: TransactionWithRelations, isCreditCard: boolean) {
  const short = formatDateShort(transaction.date)
  // Compra no cartão: a data é só a data da compra, o vencimento é da fatura (ver InvoiceModal), não desta linha.
  if (isCreditCard || transaction.applied_to_balance) return short
  const due = transactionDueDate(transaction, transaction.account)
  const prefix = due < todayISO() ? 'Venceu' : 'Vence'
  const hasSeparateDue = Boolean(transaction.due_date && transaction.due_date !== transaction.date)
  if (hasSeparateDue) return `${short} · ${prefix.toLowerCase()} ${formatDateShort(due)}`
  return `${prefix} ${short}`
}

export function TransactionListItem({
  transaction,
  onClick,
}: {
  transaction: TransactionWithRelations
  onClick?: () => void
}) {
  const isIncome = transaction.type === 'income'
  const isCreditCard = transaction.account?.type === 'credit_card'
  const invoiceDue = isCreditCard ? transactionDueDate(transaction, transaction.account) : null
  const showInvoiceDue = Boolean(invoiceDue && invoiceDue !== transaction.date)
  const Icon = resolveIcon(transaction.category?.icon)
  const color = transaction.category?.color ?? '#2DD4BF'
  const { confirm, unconfirm } = useTransactionMutations()
  const toast = useToast()

  async function toggleStatus(e: MouseEvent) {
    e.stopPropagation()
    try {
      if (transaction.applied_to_balance) {
        await unconfirm.mutateAsync(transaction.id)
        toast.success('Confirmação desfeita — voltou para Movimentações.')
      } else {
        await confirm.mutateAsync({ id: transaction.id })
        toast.success(isIncome ? 'Recebimento confirmado — movido para Relatórios.' : 'Pagamento confirmado — movido para Relatórios.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar status.')
    }
  }

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-white/[0.04]">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-primary">
            <span className="truncate">{transaction.description}</span>
            {transaction.installment_total && transaction.installment_total > 1 && (
              <Repeat className="h-3 w-3 shrink-0 text-ink-muted" aria-label="Movimentação recorrente/parcelada" />
            )}
          </p>
          <p className="truncate text-xs text-ink-secondary">
            <span
              className={
                isCreditCard || transaction.applied_to_balance
                  ? 'text-ink-primary/70'
                  : transactionDueDate(transaction, transaction.account) < todayISO()
                    ? 'font-medium text-danger'
                    : 'font-medium text-warning'
              }
            >
              {dateLabel(transaction, isCreditCard)}
            </span>{' '}
            · {transaction.category?.name ?? 'Sem categoria'} · {transaction.account?.name ?? '—'}
            {transaction.installment_total && transaction.installment_total > 1
              ? ` · ${transaction.installment_number}/${transaction.installment_total}`
              : ''}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className={`flex items-center gap-1 whitespace-nowrap text-sm font-bold ${isIncome ? 'text-positive' : 'text-danger'}`}>
          {isIncome ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
          {isIncome ? '+' : '-'}
          {formatCentsToBRL(transaction.amount_cents)}
        </div>
        {isCreditCard ? (
          showInvoiceDue && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
              Fatura vence {formatDateShort(invoiceDue!)}
            </span>
          )
        ) : (
          <button
            onClick={toggleStatus}
            disabled={confirm.isPending || unconfirm.isPending}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${statusClasses(transaction)}`}
            title={transaction.applied_to_balance ? 'Toque para desfazer' : 'Toque para confirmar'}
          >
            {transaction.applied_to_balance && <Undo2 className="h-2.5 w-2.5" />}
            {statusLabel(transaction)}
          </button>
        )}
      </div>
    </div>
  )
}
