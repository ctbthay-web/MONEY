import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../ui/Toast'
import { useTransferMutations, useTransfers } from '../../lib/queries/useTransfers'
import {
  currentInvoicePeriod,
  groupTransactionsByInvoice,
  invoicePeriodLabel,
  shiftPeriod,
} from '../../lib/invoices'
import { formatCentsToBRL, formatDate, todayISO } from '../../lib/format'
import { ACCOUNT_TYPE_LABELS } from '../../lib/accountTypes'
import type { Account, TransactionWithRelations } from '../../types/database'

export function InvoiceModal({
  open,
  onClose,
  account,
  transactions,
  otherAccounts,
}: {
  open: boolean
  onClose: () => void
  account: Account | null
  transactions: TransactionWithRelations[]
  otherAccounts: Account[]
}) {
  const [period, setPeriod] = useState<string | null>(null)
  const [payFrom, setPayFrom] = useState('')
  const { data: transfers = [] } = useTransfers()
  const { create: createTransfer } = useTransferMutations()
  const toast = useToast()

  const groups = useMemo(() => (account ? groupTransactionsByInvoice(transactions, account) : []), [transactions, account])
  const activePeriod = period ?? (account?.closing_day ? currentInvoicePeriod(account.closing_day) : groups.at(-1)?.period ?? '')
  const group = groups.find((g) => g.period === activePeriod)
  const isPaid = Boolean(account) && transfers.some((t) => t.to_account_id === account!.id && t.invoice_period === activePeriod)

  async function markAsPaid() {
    if (!account || !group || !payFrom) return
    try {
      await createTransfer.mutateAsync({
        from_account_id: payFrom,
        to_account_id: account.id,
        amount_cents: group.totalCents,
        date: todayISO(),
        description: `Pagamento fatura ${invoicePeriodLabel(activePeriod)}`,
        invoice_period: activePeriod,
      })
      toast.success('Fatura marcada como paga.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar pagamento.')
    }
  }

  if (!account) return null

  return (
    <Modal open={open} onClose={onClose} title={`Fatura · ${account.name}`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPeriod(shiftPeriod(activePeriod, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-white/5"
            aria-label="Fatura anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-display text-sm font-semibold text-ink-primary">{invoicePeriodLabel(activePeriod)}</span>
          <button
            onClick={() => setPeriod(shiftPeriod(activePeriod, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-white/5"
            aria-label="Próxima fatura"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-xs text-ink-secondary">Total da fatura</p>
          <p className={`font-display mt-1 text-3xl font-bold ${(group?.totalCents ?? 0) > 0 ? 'text-danger' : 'text-ink-primary'}`}>{formatCentsToBRL(group?.totalCents ?? 0)}</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            {group?.dueDate && <span className="text-xs text-ink-muted">Vence em {formatDate(group.dueDate)}</span>}
            <Badge tone={isPaid ? 'brand' : 'neutral'}>{isPaid ? 'Paga' : 'Pendente'}</Badge>
          </div>
        </div>

        {!group || group.purchases.length === 0 ? (
          <EmptyState title="Nenhuma compra nesta fatura" />
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {group.purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-primary">{p.description}</p>
                  <p className="text-xs text-ink-secondary">
                    {p.category?.name ?? 'Sem categoria'} · {formatDate(p.date)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-danger">{formatCentsToBRL(p.amount_cents)}</span>
              </div>
            ))}
          </div>
        )}

        {!isPaid && group && group.totalCents > 0 && (
          <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
            <Select value={payFrom} onChange={(e) => setPayFrom(e.target.value)}>
              <option value="">Pagar com qual conta?</option>
              {otherAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
                </option>
              ))}
            </Select>
            <Button onClick={markAsPaid} disabled={!payFrom} loading={createTransfer.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Marcar como paga
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
