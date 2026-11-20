import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Inbox, X, SlidersHorizontal, FileUp, Repeat } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { TransactionListItem } from '../components/finance/TransactionListItem'
import { ImportInvoiceModal } from '../components/finance/ImportInvoiceModal'
import { TransactionForm } from '../components/finance/TransactionForm'
import { RecurrencesModal } from '../components/finance/RecurrencesModal'
import { RecurrenceFulfillModal } from '../components/finance/RecurrenceFulfillModal'
import { RecurrenceSuggestions } from '../components/finance/RecurrenceSuggestions'
import { useRecurrences } from '../lib/queries/useRecurrences'
import { MODE_LABEL, addDaysISO, predictOccurrences, type PredictedOccurrence } from '../lib/recurrence'
import { useTransactions, useTransactionMutations } from '../lib/queries/useTransactions'
import { useCategories } from '../lib/queries/useCategories'
import { useFeatureGate } from '../lib/useFeatureGate'
import { useAccounts } from '../lib/queries/useAccounts'
import { ACCOUNT_TYPE_LABELS } from '../lib/accountTypes'
import { isTransactionSettled, transactionDueDate } from '../lib/invoices'
import { useTransfers } from '../lib/queries/useTransfers'
import { useToast } from '../components/ui/Toast'
import { formatCentsToBRL, formatDate, todayISO } from '../lib/format'
import type { TransactionWithRelations, TxType } from '../types/database'

type SortMode = 'date_desc' | 'amount_desc' | 'amount_asc'

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = (searchParams.get('type') as TxType | 'all') ?? 'all'

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [accountId, setAccountId] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortBy, setSortBy] = useState<SortMode>('date_desc')
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Por padrão só aparece o que já venceu ou vence até o fim do mês atual — evita dar baixa
  // por engano em despesa/receita de meses futuros. "Ver meses futuros" libera o resto.
  const [showFuture, setShowFuture] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [recurrencesOpen, setRecurrencesOpen] = useState(false)
  const [fulfilling, setFulfilling] = useState<PredictedOccurrence | null>(null)
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null)
  const [deleting, setDeleting] = useState<TransactionWithRelations | null>(null)

  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { remove } = useTransactionMutations()
  const toast = useToast()
  const guard = useFeatureGate()

  // Data De/Até filtra pelo vencimento efetivo (para cartão de crédito, o vencimento da fatura —
  // nunca a data da compra), então o filtro é aplicado no cliente, não no servidor.
  const filters = useMemo(
    () => ({
      type: typeParam,
      search: search.trim() || undefined,
      categoryId,
      accountId,
    }),
    [typeParam, search, categoryId, accountId]
  )
  const { data: rawTransactions, isLoading, isError, refetch } = useTransactions(filters)
  const hasDateFilter = Boolean(startDate || endDate)
  const activeFilterCount =
    (categoryId !== 'all' ? 1 : 0) + (accountId !== 'all' ? 1 : 0) + (sortBy !== 'date_desc' ? 1 : 0) + (hasDateFilter ? 1 : 0)

  const { data: transfers = [] } = useTransfers()

  // Previsões de recorrências (valor variável / por ocorrência). Ficam SEPARADAS da lista e dos totais abaixo:
  // não são movimentações, não entram no saldo nem no "em aberto" até o usuário informar o valor.
  const { data: recurrences = [] } = useRecurrences()
  const { data: allTransactions = [] } = useTransactions()
  const monthEndStr = useMemo(() => {
    const now = new Date()
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
  }, [])

  // Movimentações mostra só o que ainda está em aberto; o que já foi quitado vai para Relatórios.
  const dueFiltered = useMemo(() => {
    if (!rawTransactions) return rawTransactions
    return rawTransactions.filter((t) => {
      if (isTransactionSettled(t, transfers)) return false
      const due = transactionDueDate(t, t.account)
      if (!hasDateFilter) return showFuture || due <= monthEndStr
      if (startDate && due < startDate) return false
      if (endDate && due > endDate) return false
      return true
    })
  }, [rawTransactions, transfers, hasDateFilter, startDate, endDate, showFuture, monthEndStr])

  const transactions = useMemo(() => {
    if (!dueFiltered) return dueFiltered
    if (sortBy === 'date_desc') return dueFiltered
    const sorted = [...dueFiltered]
    sorted.sort((a, b) => (sortBy === 'amount_desc' ? b.amount_cents - a.amount_cents : a.amount_cents - b.amount_cents))
    return sorted
  }, [dueFiltered, sortBy])

  const predicted = useMemo(() => {
    if (recurrences.length === 0) return [] as PredictedOccurrence[]
    const today = todayISO()
    const horizon = hasDateFilter ? endDate || addDaysISO(today, 365) : showFuture ? addDaysISO(today, 365) : monthEndStr
    const term = search.trim().toLowerCase()
    return predictOccurrences(recurrences, allTransactions, today, horizon).filter((p) => {
      const r = p.recurrence
      if (typeParam !== 'all' && r.type !== typeParam) return false
      if (categoryId !== 'all' && r.category_id !== categoryId) return false
      if (accountId !== 'all' && r.account_id !== accountId) return false
      if (term && !r.description.toLowerCase().includes(term)) return false
      if (startDate && p.date < startDate) return false
      if (endDate && p.date > endDate) return false
      return true
    })
  }, [recurrences, allTransactions, hasDateFilter, startDate, endDate, showFuture, monthEndStr, typeParam, categoryId, accountId, search])

  const summary = useMemo(() => {
    const list = dueFiltered ?? []
    const netCents = list.reduce((sum, t) => sum + (t.type === 'income' ? t.amount_cents : -t.amount_cents), 0)
    return { count: list.length, netCents }
  }, [dueFiltered])

  function setMonthRange(offset: number) {
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const first = new Date(target.getFullYear(), target.getMonth(), 1)
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0)
    setStartDate(first.toISOString().slice(0, 10))
    setEndDate(last.toISOString().slice(0, 10))
  }

  function setType(t: TxType | 'all') {
    const next = new URLSearchParams(searchParams)
    if (t === 'all') next.delete('type')
    else next.set('type', t)
    setSearchParams(next, { replace: true })
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Movimentação excluída.')
      setDeleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Movimentações</h1>
          {!isLoading && (
            <>
            <p className="mt-1 text-sm text-ink-secondary">
              <span
                className={`font-display text-base font-bold ${summary.netCents >= 0 ? 'text-positive' : 'text-danger'}`}
              >
                {formatCentsToBRL(summary.netCents)}
              </span>{' '}
              · {summary.count} em aberto ·{' '}
              {hasDateFilter
                ? 'período escolhido'
                : showFuture
                  ? 'todos os meses'
                  : 'vencidas e deste mês'}{' '}
              · quitadas ficam em Relatórios
            </p>
            {!hasDateFilter && (
              <button
                type="button"
                onClick={() => setShowFuture((v) => !v)}
                className="mt-1 text-xs font-semibold text-brand-300 underline-offset-2 hover:underline"
              >
                {showFuture ? 'Mostrar só vencidas e deste mês' : 'Ver meses futuros'}
              </button>
            )}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRecurrencesOpen(true)} size="md">
            <Repeat className="h-4 w-4" />
            Recorrências
          </Button>
          <Button variant="secondary" onClick={() => guard('import_invoice') && setImportOpen(true)} size="md">
            <FileUp className="h-4 w-4" />
            <span className="hidden sm:inline">Importar fatura</span>
            <span className="sm:hidden">Fatura</span>
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            size="md"
          >
            <Plus className="h-4 w-4" />
            Nova
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1 sm:w-fit sm:grid-cols-3">
        {(['all', 'income', 'expense'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              typeParam === t ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {t === 'all' ? 'Todas' : t === 'income' ? 'Receitas' : 'Despesas'}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Buscar por descrição"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setFiltersOpen((v) => !v)}
          className="shrink-0 sm:hidden"
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-[#04241C]">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex flex-col gap-3`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortMode)}>
            <option value="date_desc">Mais recentes primeiro</option>
            <option value="amount_desc">Maior valor primeiro</option>
            <option value="amount_asc">Menor valor primeiro</option>
          </Select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 grid-cols-2 gap-3">
            <Input label="De" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Até" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setMonthRange(0)}>
              Este mês
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setMonthRange(1)}>
              Próximo mês
            </Button>
            {hasDateFilter && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                }}
                aria-label="Limpar filtro de data"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <RecurrenceSuggestions limit={2} />

      {predicted.length > 0 && (
        <Card className="p-2 sm:p-3">
          <div className="px-2 pb-1 pt-1">
            <h2 className="text-sm font-semibold text-ink-primary">Previstas</h2>
            <p className="text-xs text-ink-secondary">
              Estimativas das suas recorrências. Não são movimentações: não entram no saldo nem nos totais até você informar o valor.
            </p>
          </div>
          {predicted.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFulfilling(p)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-ink-muted">
                <Repeat className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-primary">{p.recurrence.description}</span>
                <span className={`block truncate text-xs ${p.overdue ? 'font-medium text-danger' : 'text-ink-secondary'}`}>
                  {p.overdue ? 'Era para' : 'Prevista para'} {formatDate(p.date)} · {MODE_LABEL[p.recurrence.mode]}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="whitespace-nowrap text-sm font-bold italic text-ink-secondary">
                  {p.amountCents !== null ? `~${formatCentsToBRL(p.amountCents)}` : 'valor a informar'}
                </span>
                <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">
                  {p.amountCents !== null ? 'estimado' : 'informar valor'}
                </span>
              </span>
            </button>
          ))}
        </Card>
      )}

      <Card className="p-2 sm:p-3">
        {isLoading && (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            title="Não foi possível carregar as movimentações"
            description="Verifique sua conexão e tente novamente."
            action={<Button onClick={() => refetch()}>Tentar novamente</Button>}
          />
        )}

        {!isLoading && !isError && transactions && transactions.length === 0 && (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title="Nenhuma movimentação em aberto"
            description="O que já foi quitado fica em Relatórios. Ajuste os filtros ou adicione uma nova movimentação."
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="h-4 w-4" />
                Nova movimentação
              </Button>
            }
          />
        )}

        {!isLoading &&
          !isError &&
          transactions &&
          transactions.length > 0 &&
          transactions.map((t) => (
            <TransactionListItem
              key={t.id}
              transaction={t}
              onClick={() => {
                setEditing(t)
                setFormOpen(true)
              }}
            />
          ))}
      </Card>

      <ImportInvoiceModal open={importOpen} onClose={() => setImportOpen(false)} />
      <RecurrencesModal open={recurrencesOpen} onClose={() => setRecurrencesOpen(false)} />
      <RecurrenceFulfillModal occurrence={fulfilling} onClose={() => setFulfilling(null)} />

      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        defaultType={typeParam === 'income' ? 'income' : 'expense'}
        onRequestDelete={(t) => {
          setFormOpen(false)
          setDeleting(t)
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir movimentação"
        description={`Tem certeza que deseja excluir "${deleting?.description}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
