import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wallet, CreditCard, Target, Inbox, ArrowLeftRight, HandCoins, Repeat } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { BalanceCard } from '../components/finance/BalanceCard'
import { InsightsPanel } from '../components/finance/InsightsPanel'
import { TransactionListItem } from '../components/finance/TransactionListItem'
import { AccountCard } from '../components/finance/AccountCard'
import { GoalCard } from '../components/finance/GoalCard'
import { ChartCard } from '../components/finance/ChartCard'
import { CategoryDonutChart } from '../components/finance/CategoryDonutChart'
import { TrendLineChart } from '../components/finance/TrendLineChart'
import { TransactionForm } from '../components/finance/TransactionForm'
import { TransferModal } from '../components/finance/TransferModal'
import { useAccounts } from '../lib/queries/useAccounts'
import { useGoals } from '../lib/queries/useGoals'
import { useTransactions } from '../lib/queries/useTransactions'
import { currentInvoiceByAccount, totalLiquidBalanceCents } from '../lib/accountTypes'
import { computeInsights } from '../lib/insights'
import { groupTransactionsByInvoice, isTransactionSettled, transactionDueDate } from '../lib/invoices'
import { useTransfers } from '../lib/queries/useTransfers'
import { useRecurrences } from '../lib/queries/useRecurrences'
import { predictOccurrences, type PredictedOccurrence } from '../lib/recurrence'
import { RecurrenceSuggestions } from '../components/finance/RecurrenceSuggestions'
import { formatCentsToBRL, formatDateShort, shiftMonthKey, todayISO } from '../lib/format'
import type { TransactionWithRelations } from '../types/database'
import { useAuth } from '../features/auth/AuthProvider'

type UpcomingItem =
  | { kind: 'tx'; due: string; t: TransactionWithRelations }
  | { kind: 'invoice'; due: string; id: string; name: string; totalCents: number }
  | { kind: 'estimate'; due: string; p: PredictedOccurrence }

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7)
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' })
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: goals, isLoading: goalsLoading } = useGoals()
  const { data: transactions, isLoading: txLoading } = useTransactions({})

  const totalBalanceCents = useMemo(() => totalLiquidBalanceCents(accounts ?? []), [accounts])
  const invoiceByAccount = useMemo(
    () => currentInvoiceByAccount(transactions ?? [], accounts ?? []),
    [transactions, accounts]
  )

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const previousMonthKey = shiftMonthKey(currentMonthKey, -1)

  const { data: transfers = [] } = useTransfers()
  const { data: recurrences = [] } = useRecurrences()

  const { income, expense, categorySlices, trend, insights } = useMemo(() => {
    const list = transactions ?? []
    // Receitas/Despesas do mês = só o mês atual, pelo mês do VENCIMENTO (igual Relatórios), quitadas ou não
    // (done + open). O overdue (em aberto de meses anteriores) não é exibido no card.
    const monthStart = `${currentMonthKey}-01`
    const income = { doneCents: 0, openCents: 0, overdueCents: 0 }
    const expense = { doneCents: 0, openCents: 0, overdueCents: 0 }
    const categoryMap = new Map<string, { name: string; icon: string; valueCents: number }>()
    const monthTotals = new Map<string, { income: number; expense: number }>()

    for (const t of list) {
      const key = monthKey(t.date)
      const due = transactionDueDate(t, t.account)
      const settled = isTransactionSettled(t, transfers)
      const bucket = monthTotals.get(key) ?? { income: 0, expense: 0 }
      if (t.type === 'income') bucket.income += t.amount_cents
      else bucket.expense += t.amount_cents
      monthTotals.set(key, bucket)

      const flow = t.type === 'income' ? income : expense
      if (monthKey(due) === currentMonthKey) {
        if (settled) flow.doneCents += t.amount_cents
        else flow.openCents += t.amount_cents
      } else if (!settled && due < monthStart) {
        flow.overdueCents += t.amount_cents
      }
      if (t.type === 'expense' && monthKey(due) === currentMonthKey) {
        const catId = t.category?.id ?? 'none'
        const existing = categoryMap.get(catId)
        categoryMap.set(catId, {
          name: t.category?.name ?? 'Sem categoria',
          icon: t.category?.icon ?? 'tag',
          valueCents: (existing?.valueCents ?? 0) + t.amount_cents,
        })
      }
    }

    const sortedMonthKeys = Array.from(monthTotals.keys()).sort()
    let running = 0
    const trend = sortedMonthKeys.map((key) => {
      const bucket = monthTotals.get(key)!
      running += bucket.income - bucket.expense
      return { label: monthLabel(key), valueCents: running }
    })

    const byDueMonth = list.map((t) => ({ ...t, date: transactionDueDate(t, t.account) }))
    const insights = computeInsights(byDueMonth, accounts ?? [], currentMonthKey, previousMonthKey)

    return {
      income,
      expense,
      categorySlices: Array.from(categoryMap.values()),
      trend,
      insights,
    }
  }, [transactions, transfers, accounts, currentMonthKey, previousMonthKey])

  // Próximos vencimentos (até 30 dias, mais atrasados): contas em aberto + faturas de cartão não pagas
  const upcoming = useMemo<UpcomingItem[]>(() => {
    const list = transactions ?? []
    const h = new Date()
    h.setDate(h.getDate() + 30)
    const horizon = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
    const items: UpcomingItem[] = []
    for (const t of list) {
      if (t.account?.type === 'credit_card' || t.applied_to_balance) continue
      const due = transactionDueDate(t, t.account)
      if (due <= horizon) items.push({ kind: 'tx', due, t })
    }
    for (const acc of accounts ?? []) {
      if (acc.type !== 'credit_card' || !acc.closing_day) continue
      for (const g of groupTransactionsByInvoice(list, acc)) {
        const paid = transfers.some((tr) => tr.to_account_id === acc.id && tr.invoice_period === g.period)
        if (!paid && g.dueDate && g.totalCents > 0 && g.dueDate <= horizon) {
          items.push({ kind: 'invoice', due: g.dueDate, id: `${acc.id}-${g.period}`, name: acc.name, totalCents: g.totalCents })
        }
      }
    }
    // Previstas de recorrências (valor variável / por ocorrência): aparecem marcadas como ESTIMADAS e nunca entram nos
    // totais do mês nem no saldo — só viram movimentação quando o usuário informa o valor.
    for (const p of predictOccurrences(recurrences, list, todayISO(), horizon)) items.push({ kind: 'estimate', due: p.date, p })
    return items.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6)
  }, [transactions, transfers, accounts, recurrences])

  const isLoading = accountsLoading || goalsLoading || txLoading

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-secondary">
            {greeting()}
            {profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </p>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon={<Plus className="h-5 w-5" />} label="Nova" onClick={() => setFormOpen(true)} />
        <QuickAction icon={<ArrowLeftRight className="h-5 w-5" />} label="Transferir" onClick={() => setTransferOpen(true)} />
        <QuickAction icon={<Target className="h-5 w-5" />} label="Metas" onClick={() => navigate('/reserves')} />
        <QuickAction icon={<HandCoins className="h-5 w-5" />} label="Empréstimos" onClick={() => navigate('/loans')} />
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <BalanceCard
          balanceCents={totalBalanceCents}
          incomeCents={income.doneCents + income.openCents}
          expenseCents={expense.doneCents + expense.openCents}
        />
      )}

      {!isLoading && <InsightsPanel insights={insights} />}

      {!isLoading && <RecurrenceSuggestions limit={1} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Evolução do saldo">
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : trend.length > 1 ? (
            <TrendLineChart data={trend} />
          ) : (
            <EmptyState title="Sem histórico suficiente" description="Registre movimentações para ver a evolução." />
          )}
        </ChartCard>

        <ChartCard title="Despesas por categoria (vencem este mês)">
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : categorySlices.length > 0 ? (
            <CategoryDonutChart data={categorySlices} />
          ) : (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nenhuma despesa este mês" />
          )}
        </ChartCard>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-secondary">Próximos vencimentos</h2>
          <button onClick={() => navigate('/transactions')} className="text-xs font-semibold text-brand-300 hover:text-brand-200">
            Ver todas
          </button>
        </div>
        <Card className="p-2 sm:p-3">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title={transactions && transactions.length > 0 ? 'Nada vencendo nos próximos 30 dias' : 'Nenhuma movimentação ainda'}
              description={
                transactions && transactions.length > 0
                  ? 'O que já foi quitado fica em Relatórios.'
                  : 'Adicione sua primeira receita ou despesa.'
              }
              action={
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" /> Nova movimentação
                </Button>
              }
            />
          ) : (
            upcoming.map((item) =>
              item.kind === 'tx' ? (
                <TransactionListItem key={item.t.id} transaction={item.t} onClick={() => navigate('/transactions')} />
              ) : item.kind === 'estimate' ? (
                <EstimateRow key={item.p.key} p={item.p} onClick={() => navigate('/transactions')} />
              ) : (
                <InvoiceRow key={item.id} item={item} onClick={() => navigate('/accounts')} />
              )
            )
          )}
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-secondary">Contas e cartões</h2>
          <button onClick={() => navigate('/accounts')} className="text-xs font-semibold text-brand-300 hover:text-brand-200">
            Ver todas
          </button>
        </div>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : accounts && accounts.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {accounts.slice(0, 4).map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                currentMonthExpenseCents={invoiceByAccount.get(a.id)?.totalCents ?? 0}
                invoiceDueDate={invoiceByAccount.get(a.id)?.dueDate ?? null}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CreditCard className="h-8 w-8" />}
            title="Nenhuma conta cadastrada"
            action={
              <Button onClick={() => navigate('/accounts')}>
                <Wallet className="h-4 w-4" /> Criar conta
              </Button>
            }
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-secondary">Metas</h2>
          <button onClick={() => navigate('/reserves')} className="text-xs font-semibold text-brand-300 hover:text-brand-200">
            Ver todas
          </button>
        </div>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : goals && goals.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {goals.slice(0, 4).map((g) => (
              <GoalCard key={g.id} goal={g} onClick={() => navigate('/reserves')} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Target className="h-8 w-8" />}
            title="Nenhuma meta criada"
            action={
              <Button onClick={() => navigate('/reserves')}>
                <Target className="h-4 w-4" /> Criar meta
              </Button>
            }
          />
        )}
      </section>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} accounts={accounts ?? []} />
    </div>
  )
}

function InvoiceRow({ item, onClick }: { item: Extract<UpcomingItem, { kind: 'invoice' }>; onClick: () => void }) {
  const overdue = item.due < todayISO()
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-300">
        <CreditCard className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-primary">Fatura {item.name}</p>
        <p className={`text-xs font-medium ${overdue ? 'text-danger' : 'text-warning'}`}>
          {overdue ? 'Venceu' : 'Vence'} {formatDateShort(item.due)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-bold text-danger">-{formatCentsToBRL(item.totalCents)}</span>
    </button>
  )
}

function EstimateRow({ p, onClick }: { p: PredictedOccurrence; onClick: () => void }) {
  const income = p.recurrence.type === 'income'
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04]">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-ink-muted">
        <Repeat className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-primary">{p.recurrence.description}</p>
        <p className={`text-xs font-medium ${p.overdue ? 'text-danger' : 'text-ink-secondary'}`}>
          {p.overdue ? 'Era para' : 'Prevista para'} {formatDateShort(p.date)} · não lançada
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="whitespace-nowrap text-sm font-bold italic text-ink-secondary">
          {p.amountCents !== null ? `${income ? '+' : '-'}~${formatCentsToBRL(p.amountCents)}` : 'valor a informar'}
        </span>
        <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">estimado</span>
      </div>
    </button>
  )
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass flex flex-col items-center gap-1.5 rounded-2xl py-3 text-ink-primary">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">{icon}</span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}
