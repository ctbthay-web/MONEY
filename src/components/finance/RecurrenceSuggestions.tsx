import { useMemo, useState } from 'react'
import { Repeat } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { useTransactions } from '../../lib/queries/useTransactions'
import { useRecurrences, useRecurrenceMutations } from '../../lib/queries/useRecurrences'
import { detectRecurrences, suggestionFrequencyText, type RecurrenceSuggestion } from '../../lib/recurrenceDetect'
import { MODE_LABEL } from '../../lib/recurrence'
import { formatCentsToBRL, formatDateShort, todayISO } from '../../lib/format'
import type { RecurrenceMode } from '../../types/database'

/**
 * Sugestões de recorrência. SÓ sugere: nada é criado sem o usuário confirmar ("Sim"). "Não" guarda a recusa
 * para a mesma sugestão não voltar. Não aparece se a tabela de recorrências ainda não existe no banco.
 */
export function RecurrenceSuggestions({ limit = 2 }: { limit?: number }) {
  const { data: transactions = [] } = useTransactions()
  const { data: recurrences, isError } = useRecurrences()
  const { acceptSuggestion, dismissSuggestion } = useRecurrenceMutations()
  const toast = useToast()
  const [modes, setModes] = useState<Record<string, RecurrenceMode>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const suggestions = useMemo(() => {
    if (!recurrences) return [] as RecurrenceSuggestion[]
    return detectRecurrences(transactions, recurrences, todayISO()).slice(0, limit)
  }, [transactions, recurrences, limit])

  if (isError || suggestions.length === 0) return null

  async function accept(s: RecurrenceSuggestion) {
    setBusy(s.key)
    try {
      await acceptSuggestion.mutateAsync({ suggestion: s, mode: modes[s.key] ?? s.mode })
      toast.success(`“${s.description}” agora é uma recorrência. Nenhuma movimentação foi alterada.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar.')
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(s: RecurrenceSuggestion) {
    setBusy(s.key)
    try {
      await dismissSuggestion.mutateAsync(s)
      toast.info('Ok, não vou sugerir essa de novo.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao dispensar.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {suggestions.map((s) => {
        const recent = s.amounts.slice(-4)
        return (
          <Card key={s.key} className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
                <Repeat className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink-primary">
                  Identificamos que <span className="font-semibold">“{s.description}”</span> acontece {suggestionFrequencyText(s.frequency)}. Deseja cadastrá-la como recorrente?
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  {s.occurrences} ocorrências, última em {formatDateShort(s.lastDate)}. Valores recentes: {recent.map((a) => formatCentsToBRL(a)).join(' · ')}
                  {s.mode === 'variable' ? ` (média ${formatCentsToBRL(s.averageCents)})` : ''}. Próxima esperada em {formatDateShort(s.nextDate)}.
                </p>
              </div>
            </div>
            <Select label="Tipo de valor" value={modes[s.key] ?? s.mode} onChange={(e) => setModes((m) => ({ ...m, [s.key]: e.target.value as RecurrenceMode }))}>
              {(['fixed', 'variable', 'per_occurrence'] as RecurrenceMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                  {m === s.mode ? ' (sugerido)' : ''}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={busy === s.key} onClick={() => dismiss(s)}>
                Não
              </Button>
              <Button loading={busy === s.key} onClick={() => accept(s)}>
                Sim, cadastrar
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
