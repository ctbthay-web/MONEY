import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Pencil, Play, Repeat, Square } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Badge } from '../ui/Badge'
import { RecurrenceSuggestions } from './RecurrenceSuggestions'
import { CurrencyInput } from '../ui/CurrencyInput'
import { useToast } from '../ui/Toast'
import { useAccounts } from '../../lib/queries/useAccounts'
import { useCategories } from '../../lib/queries/useCategories'
import { useTransactions } from '../../lib/queries/useTransactions'
import { useRecurrences, useRecurrenceMutations } from '../../lib/queries/useRecurrences'
import { FREQUENCY_LABEL, MODE_HELP, MODE_LABEL, legacySeries, recurrenceStats, type LegacySeries } from '../../lib/recurrence'
import { formatCentsToBRL, formatDate, todayISO } from '../../lib/format'
import { ACCOUNT_TYPE_LABELS } from '../../lib/accountTypes'
import type { Recurrence, RecurrenceStatus } from '../../types/database'

const STATUS_LABEL: Record<RecurrenceStatus, string> = { active: 'Ativa', paused: 'Pausada', ended: 'Encerrada', dismissed: 'Dispensada' }
const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 280
  const h = 56
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 8) + 4},${h - 6 - ((v - min) / span) * (h - 12)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="Variação do valor ao longo do tempo">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-brand-300" />
      {values.map((v, i) => (
        <circle key={i} cx={(i / (values.length - 1)) * (w - 8) + 4} cy={h - 6 - ((v - min) / span) * (h - 12)} r="2.5" className="fill-brand-300" />
      ))}
    </svg>
  )
}

/**
 * Recorrências: lista, histórico, edição, pausa, encerramento e reativação — tudo numa janela dentro de Movimentações.
 * Previsões nunca são contadas aqui como despesa: só movimentações reais entram em histórico, média, maior e menor.
 */
export function RecurrencesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const today = todayISO()
  const { data: recs = [], isLoading, isError } = useRecurrences()
  const { data: transactions = [] } = useTransactions()
  const { data: accounts = [] } = useAccounts()
  const { data: expenseCats = [] } = useCategories('expense')
  const { data: incomeCats = [] } = useCategories('income')
  const { adoptOne, updateRecurrence, setStatus, removeFutureOpen, updateSeriesFrom } = useRecurrenceMutations()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<'paused' | 'ended' | null>(null)
  const [form, setForm] = useState({ description: '', categoryId: '', accountId: '', amount: 0, mode: 'variable' as Recurrence['mode'] })

  const visible = useMemo(() => recs.filter((r) => r.status !== 'dismissed'), [recs])
  const legacy = useMemo(() => legacySeries(transactions, recs), [transactions, recs])
  const order = { active: 0, paused: 1, ended: 2, dismissed: 3 } as const
  const sorted = useMemo(() => [...visible].sort((a, b) => order[a.status] - order[b.status] || a.description.localeCompare(b.description)), [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = sorted.find((r) => r.id === selectedId) ?? null
  const stats = useMemo(() => (selected ? recurrenceStats(selected, transactions, today) : null), [selected, transactions, today])
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Conta'
  const categoryName = (id: string | null) => [...expenseCats, ...incomeCats].find((c) => c.id === id)?.name ?? 'Sem categoria'

  function close() {
    setSelectedId(null)
    setEditing(false)
    setPending(null)
    onClose()
  }

  function openDetail(rec: Recurrence) {
    setSelectedId(rec.id)
    setEditing(false)
    setPending(null)
  }

  async function adopt(s: LegacySeries) {
    try {
      const rec = await adoptOne.mutateAsync({ seriesId: s.seriesId, transactions })
      toast.success('Agora gerenciada como valor fixo. Nenhuma movimentação foi alterada.')
      openDetail(rec)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar a recorrência.')
    }
  }

  function startEdit(rec: Recurrence) {
    setForm({ description: rec.description, categoryId: rec.category_id ?? '', accountId: rec.account_id, amount: rec.amount_cents ?? 0, mode: rec.mode })
    setEditing(true)
  }

  async function saveEdit(rec: Recurrence) {
    if (!form.description.trim()) {
      toast.error('Informe o nome da recorrência.')
      return
    }
    try {
      await updateRecurrence.mutateAsync({
        id: rec.id,
        patch: {
          description: form.description.trim(),
          category_id: form.categoryId || null,
          account_id: form.accountId,
          ...(rec.mode !== 'per_occurrence' && form.amount > 0 ? { amount_cents: form.amount } : {}),
          ...(rec.mode !== 'fixed' ? { mode: form.mode } : {}),
        },
      })
      let extra = ''
      if (rec.mode === 'fixed' && rec.series_id) {
        // "esta e as próximas": só as ocorrências futuras ainda não confirmadas; o passado nunca é reescrito
        const n = await updateSeriesFrom.mutateAsync({
          seriesId: rec.series_id,
          fromDate: today,
          patch: {
            description: form.description.trim(),
            category_id: form.categoryId || null,
            account_id: form.accountId,
            ...(form.amount > 0 ? { amount_cents: form.amount } : {}),
          },
        })
        extra = n > 0 ? ` ${n} ocorrência(s) futura(s) atualizada(s); as anteriores não mudaram.` : ''
      }
      toast.success(`Recorrência atualizada.${extra}`)
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  const futureOpenCount = (rec: Recurrence) =>
    rec.series_id ? transactions.filter((t) => t.series_id === rec.series_id && !t.applied_to_balance && t.date > today).length : 0

  async function applyStatus(rec: Recurrence, status: RecurrenceStatus, removeFuture: boolean) {
    try {
      await setStatus.mutateAsync({ id: rec.id, status, today })
      let removed = 0
      if (removeFuture && rec.series_id) removed = await removeFutureOpen.mutateAsync({ seriesId: rec.series_id, fromDate: today })
      toast.success(
        status === 'active'
          ? 'Recorrência reativada. As previsões voltam a partir de hoje.'
          : `${status === 'paused' ? 'Recorrência pausada' : 'Recorrência encerrada'}.${removed > 0 ? ` ${removed} ocorrência(s) futura(s) removida(s).` : ''}`
      )
      setPending(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar.')
    }
  }

  const title = selected ? selected.description : 'Recorrências'

  return (
    <Modal open={open} onClose={close} title={title}>
      {isError ? (
        <p className="text-sm text-ink-secondary">As recorrências ainda estão sendo configuradas. Tente novamente em instantes.</p>
      ) : !selected ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-secondary">
            Despesas e receitas que se repetem. Para criar uma, use <span className="font-semibold text-ink-primary">Nova → Repetição → Recorrente</span> e escolha valor fixo, variável ou por ocorrência.
          </p>

          {isLoading && <p className="text-sm text-ink-secondary">Carregando…</p>}

          <RecurrenceSuggestions limit={5} />

          {!isLoading && sorted.length === 0 && legacy.length === 0 && (
            <p className="rounded-2xl border border-border p-4 text-center text-sm text-ink-secondary">Você ainda não tem recorrências.</p>
          )}

          {sorted.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sorted.map((rec) => {
                const st = recurrenceStats(rec, transactions, today)
                return (
                  <li key={rec.id}>
                    <button onClick={() => openDetail(rec)} className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.06]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
                        <Repeat className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-primary">{rec.description}</span>
                        <span className="block truncate text-xs text-ink-secondary">
                          {MODE_LABEL[rec.mode]} · {FREQUENCY_LABEL[rec.frequency]}
                          {st.average !== null && ` · média ${formatCentsToBRL(st.average)}`}
                          {st.nextDate && ` · próxima ${formatDate(st.nextDate)}${rec.mode === 'variable' && st.nextEstimateCents ? ` (~${formatCentsToBRL(st.nextEstimateCents)})` : ''}`}
                        </span>
                      </span>
                      {rec.status !== 'active' && <Badge tone="neutral">{STATUS_LABEL[rec.status]}</Badge>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {legacy.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recorrências já criadas</h4>
              <p className="text-xs text-ink-secondary">
                Criadas antes desta tela. Aparecem como valor fixo. Gerenciar não altera, apaga nem duplica nenhuma movimentação.
              </p>
              <ul className="flex flex-col gap-2">
                {legacy.map((s) => (
                  <li key={s.seriesId} className="glass flex items-center gap-3 rounded-2xl p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-ink-muted">
                      <Repeat className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-primary">{s.description}</span>
                      <span className="block truncate text-xs text-ink-secondary">
                        Valor fixo · {FREQUENCY_LABEL[s.frequency]} · {formatCentsToBRL(s.amountCents)} · {s.rows.length} ocorrências
                      </span>
                    </span>
                    <Button size="sm" variant="secondary" loading={adoptOne.isPending} onClick={() => adopt(s)}>
                      Gerenciar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        stats && (
          <div className="flex flex-col gap-4">
            <button onClick={() => { setSelectedId(null); setEditing(false); setPending(null) }} className="flex items-center gap-1 self-start text-sm font-medium text-brand-300 hover:text-brand-200">
              <ChevronLeft className="h-4 w-4" /> Todas as recorrências
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{MODE_LABEL[selected.mode]}</Badge>
              <Badge tone="neutral">{FREQUENCY_LABEL[selected.frequency]}</Badge>
              <Badge tone={selected.status === 'active' ? 'neutral' : 'danger'}>{STATUS_LABEL[selected.status]}</Badge>
              <span className="text-xs text-ink-secondary">
                {accountName(selected.account_id)} · {categoryName(selected.category_id)}
              </span>
            </div>
            <p className="text-xs text-ink-secondary">{MODE_HELP[selected.mode]}</p>

            {!editing ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                  {[
                    { label: 'Ocorrências', value: String(stats.count) },
                    { label: 'Média', value: stats.average !== null ? formatCentsToBRL(stats.average) : '—' },
                    { label: 'Última', value: stats.last ? formatCentsToBRL(stats.last.amount_cents) : '—' },
                    { label: 'Maior', value: stats.max ? formatCentsToBRL(stats.max.amount_cents) : '—' },
                    { label: 'Menor', value: stats.min ? formatCentsToBRL(stats.min.amount_cents) : '—' },
                    {
                      label: selected.mode === 'variable' ? 'Próxima (estimada)' : 'Próxima',
                      value: stats.nextDate ? `${formatDate(stats.nextDate)}${stats.nextEstimateCents ? ` · ${formatCentsToBRL(stats.nextEstimateCents)}` : ''}` : '—',
                    },
                  ].map((c) => (
                    <div key={c.label} className="glass rounded-2xl p-3">
                      <p className="text-[11px] text-ink-secondary">{c.label}</p>
                      <p className="font-display text-sm font-bold text-ink-primary">{c.value}</p>
                    </div>
                  ))}
                </div>

                {stats.trendPct !== null && (
                  <p className="text-xs text-ink-secondary">
                    A última ocorrência ficou <span className="font-semibold text-ink-primary">{pct(stats.trendPct)}</span> em relação à média das anteriores.
                  </p>
                )}
                <Sparkline values={stats.variation.slice(-12).map((v) => v.cents)} />

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Histórico</h4>
                  {stats.history.length === 0 ? (
                    <p className="text-sm text-ink-secondary">Nenhuma ocorrência lançada ainda.</p>
                  ) : (
                    <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                      {[...stats.variation].reverse().slice(0, 24).map((v) => {
                        const t = stats.history.find((h) => h.id === v.id)
                        return (
                          <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm">
                            <span className="text-ink-secondary">
                              {formatDate(v.date)} · {t?.applied_to_balance ? 'confirmada' : 'em aberto'}
                            </span>
                            <span className="flex items-center gap-2">
                              {v.deltaPct !== null && Math.abs(v.deltaPct) >= 1 && (
                                <span className={`text-xs ${v.deltaPct > 0 ? 'text-danger' : 'text-positive'}`}>{pct(v.deltaPct)}</span>
                              )}
                              <span className="font-semibold text-ink-primary">{formatCentsToBRL(v.cents)}</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {pending ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                    <p className="text-sm text-ink-primary">
                      {pending === 'paused' ? 'Pausar' : 'Encerrar'} “{selected.description}”?
                      {futureOpenCount(selected) > 0 && ` Há ${futureOpenCount(selected)} ocorrência(s) futura(s) já criada(s) e ainda não confirmada(s).`}
                    </p>
                    {futureOpenCount(selected) > 0 ? (
                      <>
                        <Button variant="secondary" loading={setStatus.isPending} onClick={() => applyStatus(selected, pending, false)}>
                          {pending === 'paused' ? 'Só pausar' : 'Só encerrar'} (manter as futuras)
                        </Button>
                        <Button loading={setStatus.isPending || removeFutureOpen.isPending} onClick={() => applyStatus(selected, pending, true)}>
                          {pending === 'paused' ? 'Pausar' : 'Encerrar'} e remover as futuras não confirmadas
                        </Button>
                      </>
                    ) : (
                      <Button loading={setStatus.isPending} onClick={() => applyStatus(selected, pending, false)}>
                        Confirmar
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setPending(null)}>
                      Voltar
                    </Button>
                    <p className="text-xs text-ink-muted">O histórico já lançado nunca é apagado.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => startEdit(selected)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    {selected.status === 'active' ? (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => setPending('paused')}>
                          <Pause className="h-4 w-4" /> Pausar
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setPending('ended')}>
                          <Square className="h-4 w-4" /> Encerrar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" loading={setStatus.isPending} onClick={() => applyStatus(selected, 'active', false)}>
                        <Play className="h-4 w-4" /> Reativar
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <Input label="Nome" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                <Select label="Categoria" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">Sem categoria</option>
                  {(selected.type === 'income' ? incomeCats : expenseCats).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select label="Conta" value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
                    </option>
                  ))}
                </Select>
                {selected.mode !== 'fixed' && (
                  <Select label="Tipo de valor" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as Recurrence['mode'] }))}>
                    <option value="variable">Valor variável (previsão pela média)</option>
                    <option value="per_occurrence">Por ocorrência (sem previsão de valor)</option>
                  </Select>
                )}
                {selected.mode !== 'per_occurrence' && (
                  <CurrencyInput
                    label={selected.mode === 'fixed' ? 'Valor das próximas ocorrências' : 'Valor base (usado só sem histórico)'}
                    valueCents={form.amount}
                    onValueChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                  />
                )}
                <p className="text-xs text-ink-muted">
                  {selected.mode === 'fixed'
                    ? 'Vale para esta e as próximas ocorrências ainda não confirmadas. O que já foi lançado não muda.'
                    : 'Vale para as próximas previsões. O que já foi lançado não muda.'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setEditing(false)}>
                    Cancelar
                  </Button>
                  <Button loading={updateRecurrence.isPending || updateSeriesFrom.isPending} onClick={() => saveEdit(selected)}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </Modal>
  )
}
