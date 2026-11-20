import { moneyTone } from '../../lib/moneyTone'
import { MoreVertical, Receipt } from 'lucide-react'
import { Card } from '../ui/Card'
import { resolveIcon } from '../../lib/icons'
import { formatCentsToBRL, formatDate } from '../../lib/format'
import { ACCOUNT_TYPE_LABELS } from '../../lib/accountTypes'
import type { Account } from '../../types/database'

export function AccountCard({
  account,
  onOptions,
  onViewInvoice,
  currentMonthExpenseCents,
  invoiceDueDate,
}: {
  account: Account
  onOptions?: () => void
  onViewInvoice?: () => void
  /** Total da fatura atual (calculado com o fechamento do cartão quando cadastrado, senão mês civil). */
  currentMonthExpenseCents?: number
  invoiceDueDate?: string | null
}) {
  const Icon = resolveIcon(account.icon)
  const isCreditCard = account.type === 'credit_card'
  const displayCents = isCreditCard ? currentMonthExpenseCents ?? 0 : account.balance_cents

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${account.color}22`, color: account.color }}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-primary">{account.name}</p>
            <p className="text-xs text-ink-secondary">{ACCOUNT_TYPE_LABELS[account.type]}</p>
          </div>
        </div>
        {onOptions && (
          <button
            onClick={onOptions}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-white/5 hover:text-ink-primary"
            aria-label="Opções"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      {isCreditCard && <p className="mt-4 text-xs font-medium text-ink-secondary">Fatura atual</p>}
      <p
        className={`whitespace-nowrap text-2xl font-bold ${isCreditCard ? (displayCents > 0 ? 'text-danger' : 'text-ink-primary') : moneyTone(displayCents)} ${isCreditCard ? 'mt-1' : 'mt-4'}`}
      >
        {formatCentsToBRL(displayCents)}
      </p>
      {isCreditCard && invoiceDueDate && (
        <p className="mt-1 text-xs text-ink-muted">Vence em {formatDate(invoiceDueDate)}</p>
      )}
      {isCreditCard && account.credit_limit_cents ? (
        <p className="mt-1 text-xs text-ink-muted">Limite: {formatCentsToBRL(account.credit_limit_cents)}</p>
      ) : null}
      {isCreditCard && onViewInvoice && (
        <button
          onClick={onViewInvoice}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-300 hover:text-brand-200"
        >
          <Receipt className="h-3.5 w-3.5" /> Ver fatura
        </button>
      )}
    </Card>
  )
}
