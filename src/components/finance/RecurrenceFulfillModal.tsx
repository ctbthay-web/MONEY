import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { CurrencyInput } from '../ui/CurrencyInput'
import { useToast } from '../ui/Toast'
import { useRecurrenceMutations } from '../../lib/queries/useRecurrences'
import { formatCentsToBRL, formatDate, todayISO } from '../../lib/format'
import type { PredictedOccurrence } from '../../lib/recurrence'

/**
 * Informar o valor REAL de uma ocorrência prevista. Só aqui a previsão vira movimentação (e só esta ocorrência:
 * as anteriores e a média não são reescritas). Cada ocorrência só pode ser lançada uma vez (índice único no banco).
 */
export function RecurrenceFulfillModal({ occurrence, onClose }: { occurrence: PredictedOccurrence | null; onClose: () => void }) {
  const { fulfill, skipOccurrence } = useRecurrenceMutations()
  const toast = useToast()
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState('')
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    if (occurrence) {
      setAmount(occurrence.amountCents ?? occurrence.recurrence.amount_cents ?? 0)
      setDate(occurrence.date)
      setPaid(occurrence.date <= todayISO())
    }
  }, [occurrence])

  if (!occurrence) return null
  const rec = occurrence.recurrence
  const isIncome = rec.type === 'income'

  async function save() {
    if (!occurrence) return
    if (amount <= 0) {
      toast.error('Informe o valor desta ocorrência.')
      return
    }
    try {
      await fulfill.mutateAsync({ recurrence: rec, expectedDate: occurrence.date, amountCents: amount, date: date || occurrence.date, paid })
      toast.success(`${rec.description}: valor de ${formatDate(occurrence.date)} informado.`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao lançar.')
    }
  }

  async function skip() {
    if (!occurrence) return
    try {
      await skipOccurrence.mutateAsync({ recurrence: rec, date: occurrence.date })
      toast.success('Ocorrência pulada.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao pular.')
    }
  }

  return (
    <Modal open onClose={onClose} title={rec.description}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-secondary">
          Ocorrência prevista para <span className="font-semibold text-ink-primary">{formatDate(occurrence.date)}</span>.{' '}
          {occurrence.amountCents !== null
            ? `Estimativa: ${formatCentsToBRL(occurrence.amountCents)}${occurrence.basedOn > 0 ? ` (média de ${occurrence.basedOn} ${occurrence.basedOn === 1 ? 'ocorrência' : 'ocorrências'})` : ''}.`
            : 'Esta recorrência não prevê valor.'}
        </p>

        <CurrencyInput label="Valor real desta ocorrência" valueCents={amount} onValueChange={setAmount} />
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-brand-400" />
          {isIncome ? 'Já recebi' : 'Já paguei'} (entra no saldo agora)
        </label>

        <p className="text-xs text-ink-muted">
          Vale só para esta ocorrência: as anteriores e a média histórica não mudam. A previsão vira uma movimentação de verdade só depois que você salvar.
        </p>

        <Button size="lg" className="w-full" loading={fulfill.isPending} onClick={save}>
          Lançar valor
        </Button>
        <Button variant="ghost" className="w-full" loading={skipOccurrence.isPending} onClick={skip}>
          Pular esta ocorrência
        </Button>
      </div>
    </Modal>
  )
}
