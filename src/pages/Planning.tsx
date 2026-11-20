import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Gauge, LineChart, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { Switch } from '../components/ui/Switch'
import { Modal } from '../components/ui/Modal'
import { CurrencyInput } from '../components/ui/CurrencyInput'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { TrendLineChart } from '../components/finance/TrendLineChart'
import { useAuth } from '../features/auth/AuthProvider'
import { useAccounts } from '../lib/queries/useAccounts'
import { useTransactions } from '../lib/queries/useTransactions'
import { useTransfers } from '../lib/queries/useTransfers'
import { useCategories } from '../lib/queries/useCategories'
import { useBudgets, useBudgetMutations, type Budget } from '../lib/queries/useBudgets'
import { canUseFeature, featureMinPlan } from '../lib/plans'
import { computeForecast } from '../lib/forecast'
import { useRecurrences } from '../lib/queries/useRecurrences'
import { estimateEvents, predictOccurrences } from '../lib/recurrence'
import { moneyTone } from '../lib/moneyTone'
import { formatCentsToBRL, formatDate, formatDateShort, todayISO } from '../lib/format'

function monthEndISO(today: string): string {
  const [y, m] = today.split('-').map(Number)
  const d = new Date(y, m, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlanningPage() {
  const { profile } = useAuth()
  const allowed = canUseFeature(profile, 'planning')

  if (!allowed) {
    const min = featureMinPlan('planning')
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-ink-primary">Planejamento</h1>
        <Card className="flex flex-col items-start gap-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink-primary">Disponível a partir do plano {min.name}</p>
            <p className="mt-1 text-sm text-ink-secondary">
              Veja quanto vai sobrar até o fim do mês e defina um orçamento por categoria, com aviso ao chegar perto do limite.
            </p>
          </div>
          <Link
            to="/subscription"
            className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-semibold text-[#04241C]"
          >
            Ver planos
          </Link>
        </Card>
      </div>
    )
  }

  return <PlanningContent />
}

function PlanningContent() {
  const toast = useToast()
  const today = todayISO()
  const ym = today.slice(0, 7)
  const endDate = monthEndISO(today)

  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts()
  const { data: transactions = [], isLoading: loadingTx } = useTransactions()
  const { data: transfers = [] } = useTransfers()
  const { data: categories = [] } = useCategories('expense')
  const { data: budgets = [], isLoading: loadingBudgets, isError: budgetsError } = useBudgets()
  const { save, remove } = useBudgetMutations()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState(0)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  // Estimativas de recorrências de valor variável: entram por padrão, com interruptor. São PREVISÃO, nunca movimentação.
  const { data: recurrences = [] } = useRecurrences()
  const [includeEstimates, setIncludeEstimates] = useState(() => {
    try {
      return localStorage.getItem('money.planning.estimates') !== 'off'
    } catch {
      return true
    }
  })
  function toggleEstimates(v: boolean) {
    setIncludeEstimates(v)
    try {
      localStorage.setItem('money.planning.estimates', v ? 'on' : 'off')
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }
  const estimates = useMemo(
    () => estimateEvents(predictOccurrences(recurrences, transactions, today, endDate), today, endDate),
    [recurrences, transactions, today, endDate]
  )
  const estimatesTotal = estimates.reduce((s, e) => s + e.cents, 0)

  const forecast = useMemo(
    () => computeForecast(accounts, transactions, transfers, today, endDate, includeEstimates ? estimates : []),
    [accounts, transactions, transfers, today, endDate, includeEstimates, estimates]
  )

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date.slice(0, 7) !== ym || !t.category_id) continue
      m.set(t.category_id, (m.get(t.category_id) ?? 0) + t.amount_cents)
    }
    return m
  }, [transactions, ym])

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const free = categories.filter((c) => !budgets.some((b) => b.category_id === c.id))
  const loading = loadingAccounts || loadingTx

  const chart = forecast.days.map((d) => ({ label: d.date.slice(8, 10), valueCents: d.balanceCents }))
  const upcoming = forecast.events.slice(0, 8)

  function openNew() {
    setEditing(null)
    setCategoryId(free[0]?.id ?? '')
    setAmount(0)
    setFormOpen(true)
  }

  function openEdit(b: Budget) {
    setEditing(b)
    setCategoryId(b.category_id)
    setAmount(b.amount_cents)
    setFormOpen(true)
  }

  async function submit() {
    if (!categoryId || amount <= 0) {
      toast.error('Escolha a categoria e informe um valor maior que zero.')
      return
    }
    try {
      await save.mutateAsync({ category_id: categoryId, amount_cents: amount })
      toast.success('Orçamento salvo.')
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Orçamento removido.')
      setDeleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-primary">Planejamento</h1>
        {loading ? (
          <Skeleton className="mt-2 h-5 w-56" />
        ) : (
          <p className="mt-1 text-sm text-ink-secondary">
            Saldo previsto no fim do mês:{' '}
            <span className={`font-semibold ${moneyTone(forecast.endCents)}`}>{formatCentsToBRL(forecast.endCents)}</span>
          </p>
        )}
      </div>

      {/* Previsão de saldo */}
      <Card glow className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink-primary">Previsão do saldo</p>
            <p className="text-xs text-ink-secondary">De hoje até {formatDate(endDate)}, com o que ainda está em aberto</p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="mt-5 h-48 w-full" />
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-ink-secondary">Saldo hoje</p>
                <p className={`font-display text-xl font-bold ${moneyTone(forecast.startCents)}`}>
                  {formatCentsToBRL(forecast.startCents)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-ink-secondary">Fim do mês</p>
                <p className={`font-display text-xl font-bold ${moneyTone(forecast.endCents)}`}>
                  {formatCentsToBRL(forecast.endCents)}
                </p>
              </div>
            </div>

            {forecast.firstNegativeDate ? (
              <p className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Atenção: o saldo previsto fica negativo a partir de {formatDate(forecast.firstNegativeDate)}. O ponto mais
                  baixo é {formatCentsToBRL(forecast.minCents)} em {formatDate(forecast.minDate)}.
                </span>
              </p>
            ) : (
              <p className="mt-4 text-sm text-ink-secondary">
                O saldo não fica negativo neste mês. O ponto mais baixo é{' '}
                <span className="font-semibold text-ink-primary">{formatCentsToBRL(forecast.minCents)}</span> em{' '}
                {formatDate(forecast.minDate)}.
              </p>
            )}

            <div className="mt-4">
              <TrendLineChart data={chart} />
            </div>

            {estimates.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-primary">Incluir estimativas das recorrências</p>
                  <p className="text-xs text-ink-secondary">
                    {estimates.length} {estimates.length === 1 ? 'previsão' : 'previsões'} de valor variável, {formatCentsToBRL(estimatesTotal)} no total. São estimativas pela média, não movimentações lançadas.
                  </p>
                </div>
                <Switch checked={includeEstimates} onChange={toggleEstimates} label="Incluir estimativas das recorrências na previsão" />
              </div>
            )}

            <p className="mt-4 text-sm font-medium text-ink-secondary">Próximas movimentações</p>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nada em aberto até o fim do mês.</p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {upcoming.map((e, i) => (
                  <li key={`${e.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-primary">{e.label}</p>
                      <p className="text-xs text-ink-muted">
                        {e.date === today ? 'Hoje' : formatDateShort(e.date)}
                        {e.kind === 'invoice' ? ' · fatura do cartão' : ''}
                        {e.kind === 'estimate' ? ' · estimativa de recorrência' : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 font-semibold ${e.kind === 'estimate' ? 'italic opacity-80 ' : ''}${moneyTone(e.cents)}`}>
                      {e.kind === 'estimate' ? '~' : ''}
                      {formatCentsToBRL(e.cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Considera contas a pagar e receber pelo vencimento (as vencidas entram hoje) e faturas de cartão ainda não pagas.
              {includeEstimates && estimates.length > 0 ? ' Inclui estimativas de recorrências (marcadas com ~).' : ''}
            </p>
          </>
        )}
      </Card>

      {/* Orçamento por categoria */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-ink-primary">Orçamento do mês</h2>
              <p className="text-xs text-ink-secondary">Gasto por categoria nas compras deste mês</p>
            </div>
          </div>
          <Button size="sm" onClick={openNew} disabled={free.length === 0}>
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </div>

        {budgetsError ? (
          <p className="text-sm text-ink-secondary">O orçamento ainda está sendo configurado. Tente novamente em instantes.</p>
        ) : loadingBudgets ? (
          <Skeleton className="h-24 w-full" />
        ) : budgets.length === 0 ? (
          <EmptyState
            icon={<Gauge className="h-8 w-8" />}
            title="Nenhum orçamento ainda"
            description="Escolha uma categoria e defina quanto quer gastar por mês. Avisamos ao chegar em 80% e ao estourar."
            action={
              <Button onClick={openNew} disabled={free.length === 0}>
                <Plus className="h-4 w-4" /> Criar orçamento
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {budgets.map((b) => {
              const cat = categoryById.get(b.category_id)
              const spent = spentByCategory.get(b.category_id) ?? 0
              const pct = Math.round((spent * 100) / b.amount_cents)
              const over = spent > b.amount_cents
              const bar = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-brand-400'
              return (
                <li key={b.id} className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-ink-primary">{cat?.name ?? 'Categoria'}</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(b)} className="text-ink-muted hover:text-ink-primary" aria-label="Editar orçamento">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleting(b)} className="text-ink-muted hover:text-danger" aria-label="Remover orçamento">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-ink-secondary">
                      {formatCentsToBRL(spent)} de {formatCentsToBRL(b.amount_cents)} ({pct}%)
                    </span>
                    <span className={over ? 'font-semibold text-danger' : 'text-ink-muted'}>
                      {over ? `Estourou ${formatCentsToBRL(spent - b.amount_cents)}` : `Restam ${formatCentsToBRL(b.amount_cents - spent)}`}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar orçamento' : 'Novo orçamento'}>
        <div className="flex flex-col gap-4">
          <Select label="Categoria" value={categoryId} disabled={Boolean(editing)} onChange={(e) => setCategoryId(e.target.value)}>
            {(editing ? categories.filter((c) => c.id === editing.category_id) : free).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <CurrencyInput label="Quanto quer gastar por mês" valueCents={amount} onValueChange={setAmount} />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" type="button" loading={save.isPending} onClick={submit}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remover orçamento"
        description="Você deixa de acompanhar essa categoria e de receber avisos dela. Seus lançamentos não são afetados."
        confirmLabel="Remover"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
