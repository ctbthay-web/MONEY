import { useMemo, useState } from 'react'
import { Inbox, Sparkles, Receipt, CalendarRange, Search, HandCoins, FileDown, FileSpreadsheet, Repeat } from 'lucide-react'
import { ACCOUNT_TYPE_LABELS } from '../lib/accountTypes'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useAuth } from '../features/auth/AuthProvider'
import { useFeatureGate } from '../lib/useFeatureGate'
import { generateTransactionsPdf } from '../lib/reportPdf'
import { downloadTransactionsCsv } from '../lib/reportCsv'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { ChartCard } from '../components/finance/ChartCard'
import { StatCard } from '../components/finance/StatCard'
import { IncomeExpenseBarChart } from '../components/finance/IncomeExpenseBarChart'
import { CategoryDonutChart } from '../components/finance/CategoryDonutChart'
import { useTransactions, useTransactionMutations } from '../lib/queries/useTransactions'
import { useLoans, useLoanMutations, useAllLoanPayments } from '../lib/queries/useLoans'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { useAccounts } from '../lib/queries/useAccounts'
import { computeInsights } from '../lib/insights'
import { isTransactionSettled, transactionDueDate } from '../lib/invoices'
import { useTransfers } from '../lib/queries/useTransfers'
import { useRecurrences } from '../lib/queries/useRecurrences'
import { predictOccurrences } from '../lib/recurrence'
import { TransactionListItem } from '../components/finance/TransactionListItem'
import { TransactionForm } from '../components/finance/TransactionForm'
import type { TransactionWithRelations, Loan } from '../types/database'
import { formatCentsToBRL, formatDate, safeRatio, shiftMonthKey } from '../lib/format'
import { TrendingUp, TrendingDown, PiggyBank, Wallet } from 'lucide-react'

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7)
}
/**
 * Mês em que a movimentação conta nos Relatórios: o do VENCIMENTO efetivo (mesma regra das
 * Movimentações) — vencimento informado, ou vencimento da fatura (compra no cartão), ou a data.
 */
function monthOf(t: TransactionWithRelations) {
  return monthKey(transactionDueDate(t, t.account))
}
function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short' })
}
function monthFullLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function daysInMonth(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

const ALL_PERIOD = 'all'

export function ReportsPage() {
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense')
  const now = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [period, setPeriod] = useState(currentKey)
  const { data: transactions, isLoading } = useTransactions({})
  const { data: accounts = [] } = useAccounts()
  const { data: transfers = [] } = useTransfers()
  const { data: recurrences = [] } = useRecurrences()
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfSituation, setPdfSituation] = useState<'both' | 'open' | 'settled'>('both')
  const [pdfBusy, setPdfBusy] = useState(false)
  const { profile } = useAuth()
  const [deleting, setDeleting] = useState<TransactionWithRelations | null>(null)
  const { remove } = useTransactionMutations()
  const toast = useToast()
  const guard = useFeatureGate()

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Movimentação excluída e saldo ajustado.')
      setDeleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  // mesma lista, com a data trocada pelo vencimento efetivo (para os insights por mês)
  const byPaymentMonth = useMemo(
    () => (transactions ?? []).map((t) => ({ ...t, date: transactionDueDate(t, t.account) })),
    [transactions]
  )

  const settledList = useMemo(
    () =>
      (transactions ?? [])
        .filter((t) => (period === ALL_PERIOD || monthOf(t) === period) && isTransactionSettled(t, transfers))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, transfers, period]
  )

  const [fSearch, setFSearch] = useState('')
  const [fType, setFType] = useState<'all' | 'income' | 'expense'>('all')
  const [fCategory, setFCategory] = useState('all')
  const [fAccount, setFAccount] = useState('all')
  const [fSort, setFSort] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc')

  const settledCategories = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of settledList) map.set(t.category?.id ?? 'none', t.category?.name ?? 'Sem categoria')
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [settledList])

  const filteredSettled = useMemo(() => {
    const q = fSearch.trim().toLowerCase()
    const list = settledList.filter(
      (t) =>
        (fType === 'all' || t.type === fType) &&
        (fCategory === 'all' || (t.category?.id ?? 'none') === fCategory) &&
        (fAccount === 'all' || t.account_id === fAccount) &&
        (!q || t.description.toLowerCase().includes(q))
    )
    const sorted = [...list]
    sorted.sort((a, b) =>
      fSort === 'date_desc'
        ? b.date.localeCompare(a.date)
        : fSort === 'date_asc'
          ? a.date.localeCompare(b.date)
          : fSort === 'amount_desc'
            ? b.amount_cents - a.amount_cents
            : a.amount_cents - b.amount_cents
    )
    return sorted
  }, [settledList, fSearch, fType, fCategory, fAccount, fSort])

  // Lista do PDF: mesmo período e mesmos filtros da tela (tipo, categoria, conta, busca, ordem),
  // podendo incluir só em aberto, só quitadas ou as duas.
  const pdfRows = useMemo(() => {
    const q = fSearch.trim().toLowerCase()
    const due = (t: TransactionWithRelations) => transactionDueDate(t, t.account)
    const rows = (transactions ?? [])
      .filter(
        (t) =>
          (period === ALL_PERIOD || monthOf(t) === period) &&
          (fType === 'all' || t.type === fType) &&
          (fCategory === 'all' || (t.category?.id ?? 'none') === fCategory) &&
          (fAccount === 'all' || t.account_id === fAccount) &&
          (!q || t.description.toLowerCase().includes(q))
      )
      .map((t) => ({ transaction: t, settled: isTransactionSettled(t, transfers) }))
      .filter((r) => pdfSituation === 'both' || (pdfSituation === 'settled') === r.settled)
    rows.sort((a, b) =>
      fSort === 'date_desc'
        ? due(b.transaction).localeCompare(due(a.transaction))
        : fSort === 'date_asc'
          ? due(a.transaction).localeCompare(due(b.transaction))
          : fSort === 'amount_desc'
            ? b.transaction.amount_cents - a.transaction.amount_cents
            : a.transaction.amount_cents - b.transaction.amount_cents
    )
    return rows
  }, [transactions, transfers, period, pdfSituation, fSearch, fType, fCategory, fAccount, fSort])

  const filtersText = useMemo(() => {
    const parts: string[] = []
    if (fSearch.trim()) parts.push(`busca "${fSearch.trim()}"`)
    if (fType !== 'all') parts.push(fType === 'income' ? 'só receitas' : 'só despesas')
    if (fCategory !== 'all') {
      const t = (transactions ?? []).find((x) => (x.category?.id ?? 'none') === fCategory)
      parts.push(`categoria ${t?.category?.name ?? 'Sem categoria'}`)
    }
    if (fAccount !== 'all') parts.push(`conta ${accounts.find((a) => a.id === fAccount)?.name ?? ''}`)
    const sortLabel = { date_desc: 'mais recentes', date_asc: 'mais antigas', amount_desc: 'maior valor', amount_asc: 'menor valor' }[fSort]
    parts.push(`ordem: ${sortLabel}`)
    return parts.join(' · ')
  }, [fSearch, fType, fCategory, fAccount, fSort, transactions, accounts])

  function downloadCsv() {
    const base = `money-lancamentos-${period === ALL_PERIOD ? 'historico' : period}`
    downloadTransactionsCsv(pdfRows, base)
    setPdfOpen(false)
  }

  async function downloadPdf() {
    setPdfBusy(true)
    try {
      await generateTransactionsPdf({
        rows: pdfRows,
        situation: pdfSituation,
        periodLabel: period === ALL_PERIOD ? 'Todo o histórico' : monthFullLabel(period),
        filtersText,
        userName: profile?.full_name ?? undefined,
      })
      setPdfOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível gerar o PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  const filteredNet = filteredSettled.reduce((s, t) => s + (t.type === 'income' ? t.amount_cents : -t.amount_cents), 0)
  const hasSettledFilters = Boolean(fSearch || fType !== 'all' || fCategory !== 'all' || fAccount !== 'all')

  // ---- Empréstimos quitados: mesmo padrão de "Movimentações quitadas" — some aqui quando o pendente chega a
  // zero (e some de Empréstimos). Nunca entra nos totais de receita/despesa acima (empréstimo não é receita/despesa).
  const { data: loans = [] } = useLoans()
  const { data: allLoanPayments = [] } = useAllLoanPayments()
  const { removePayment } = useLoanMutations()
  const [undoingLoan, setUndoingLoan] = useState<Loan | null>(null)

  const { paidByLoan, lastPaymentByLoan } = useMemo(() => {
    const paid = new Map<string, number>()
    const last = new Map<string, (typeof allLoanPayments)[number]>()
    for (const p of allLoanPayments) {
      paid.set(p.loan_id, (paid.get(p.loan_id) ?? 0) + p.amount_cents)
      const current = last.get(p.loan_id)
      if (!current || p.created_at > current.created_at) last.set(p.loan_id, p)
    }
    return { paidByLoan: paid, lastPaymentByLoan: last }
  }, [allLoanPayments])
  const loanPendingOf = (loan: Loan) => Math.max(0, loan.principal_cents - (paidByLoan.get(loan.id) ?? 0))

  const settledLoans = useMemo(
    () =>
      loans.filter((l) => {
        if (loanPendingOf(l) !== 0) return false
        const settledDate = lastPaymentByLoan.get(l.id)?.date
        return period === ALL_PERIOD || (settledDate && settledDate.slice(0, 7) === period)
      }),
    [loans, paidByLoan, lastPaymentByLoan, period]
  )

  const [lSearch, setLSearch] = useState('')
  const [lDirection, setLDirection] = useState<'all' | 'lent' | 'borrowed'>('all')
  const [lSort, setLSort] = useState<'recent' | 'oldest' | 'amount_desc' | 'amount_asc'>('recent')
  const hasLoanFilters = Boolean(lSearch || lDirection !== 'all')

  const filteredSettledLoans = useMemo(() => {
    const q = lSearch.trim().toLowerCase()
    const list = settledLoans.filter(
      (l) => (lDirection === 'all' || l.direction === lDirection) && (!q || l.counterparty.toLowerCase().includes(q))
    )
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (lSort === 'amount_desc') return b.principal_cents - a.principal_cents
      if (lSort === 'amount_asc') return a.principal_cents - b.principal_cents
      const da = lastPaymentByLoan.get(a.id)?.date ?? ''
      const db = lastPaymentByLoan.get(b.id)?.date ?? ''
      return lSort === 'oldest' ? da.localeCompare(db) : db.localeCompare(da)
    })
    return sorted
  }, [settledLoans, lSearch, lDirection, lSort, lastPaymentByLoan])

  const filteredLoansTotal = filteredSettledLoans.reduce((s, l) => s + l.principal_cents, 0)

  async function confirmUndoLoan() {
    if (!undoingLoan) return
    const payment = lastPaymentByLoan.get(undoingLoan.id)
    if (!payment) {
      setUndoingLoan(null)
      return
    }
    try {
      await removePayment.mutateAsync(payment.id)
      toast.success('Quitação desfeita — o empréstimo voltou para Empréstimos.')
      setUndoingLoan(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desfazer.')
    }
  }

  const { monthlyBars, periodOptions, monthTotals } = useMemo(() => {
    const list = transactions ?? []
    const monthTotals = new Map<string, { income: number; expense: number }>()
    for (const t of list) {
      const key = monthOf(t)
      const bucket = monthTotals.get(key) ?? { income: 0, expense: 0 }
      if (t.type === 'income') bucket.income += t.amount_cents
      else bucket.expense += t.amount_cents
      monthTotals.set(key, bucket)
    }
    if (!monthTotals.has(currentKey)) monthTotals.set(currentKey, { income: 0, expense: 0 })
    const sortedKeys = Array.from(monthTotals.keys()).sort()
    return {
      monthlyBars: sortedKeys.map((key) => ({
        label: monthLabel(key),
        incomeCents: monthTotals.get(key)!.income,
        expenseCents: monthTotals.get(key)!.expense,
      })),
      periodOptions: [...sortedKeys].reverse(),
      monthTotals,
    }
  }, [transactions, currentKey])

  const { totalIncome, totalExpense, openIncome, openExpense, categorySlices, biggestExpense } = useMemo(() => {
    const list = (transactions ?? []).filter((t) => period === ALL_PERIOD || monthOf(t) === period)
    let totalIncome = 0
    let totalExpense = 0
    let openIncome = 0
    let openExpense = 0
    const categoryMap = new Map<string, { name: string; icon: string; valueCents: number }>()
    let biggestExpense: (typeof list)[number] | null = null

    for (const t of list) {
      const open = !isTransactionSettled(t, transfers)
      if (t.type === 'income') {
        totalIncome += t.amount_cents
        if (open) openIncome += t.amount_cents
      } else {
        totalExpense += t.amount_cents
        if (open) openExpense += t.amount_cents
        if (!biggestExpense || t.amount_cents > biggestExpense.amount_cents) biggestExpense = t
      }

      if (t.type === categoryType) {
        const catId = t.category?.id ?? 'none'
        const existing = categoryMap.get(catId)
        categoryMap.set(catId, {
          name: t.category?.name ?? 'Sem categoria',
          icon: t.category?.icon ?? 'tag',
          valueCents: (existing?.valueCents ?? 0) + t.amount_cents,
        })
      }
    }

    return {
      totalIncome,
      totalExpense,
      openIncome,
      openExpense,
      categorySlices: Array.from(categoryMap.values()),
      biggestExpense,
    }
  }, [transactions, transfers, period, categoryType])

  // PREVISTO (recorrências de valor variável / por ocorrência): bloco separado, nunca somado aos totais acima.
  // Só há previsão para o mês atual e os futuros (passado = só o que foi lançado).
  const predictedOfPeriod = useMemo(() => {
    if (period === ALL_PERIOD || period < currentKey || recurrences.length === 0) return []
    const from = `${period}-01`
    const to = `${period}-${String(daysInMonth(period)).padStart(2, '0')}`
    const today = `${currentKey}-${String(now.getDate()).padStart(2, '0')}`
    return predictOccurrences(recurrences, transactions ?? [], today, to).filter((p) => p.date >= from && p.date <= to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurrences, transactions, period, currentKey])
  const predictedExpense = predictedOfPeriod.filter((p) => p.recurrence.type === 'expense').reduce((s, p) => s + (p.amountCents ?? 0), 0)
  const predictedIncome = predictedOfPeriod.filter((p) => p.recurrence.type === 'income').reduce((s, p) => s + (p.amountCents ?? 0), 0)
  const predictedNoValue = predictedOfPeriod.filter((p) => p.amountCents === null).length

  // sobra do período = o que fica depois de receitas − despesas (mesma base da Taxa de economia: inclui em aberto)
  const netCents = totalIncome - totalExpense

  const previousKey = period !== ALL_PERIOD ? shiftMonthKey(period, -1) : null
  const previousTotals = previousKey ? monthTotals.get(previousKey) : undefined

  const incomeTrend =
    previousTotals && previousTotals.income > 0
      ? { percent: safeRatio(totalIncome - previousTotals.income, previousTotals.income) * 100, positiveIsGood: true }
      : null
  const expenseTrend =
    previousTotals && previousTotals.expense > 0
      ? { percent: safeRatio(totalExpense - previousTotals.expense, previousTotals.expense) * 100, positiveIsGood: false }
      : null

  const avgLabel = period === ALL_PERIOD ? 'Média mensal de despesas' : 'Média diária de despesas'
  const avgExpenseCents =
    period === ALL_PERIOD
      ? Math.round(safeRatio(totalExpense, Math.max(1, monthTotals.size)))
      : Math.round(
          safeRatio(totalExpense, period === currentKey ? now.getDate() : daysInMonth(period))
        )

  const periodInsights = useMemo(() => {
    if (!previousKey) return []
    return computeInsights(byPaymentMonth, accounts, period, previousKey)
  }, [byPaymentMonth, accounts, period, previousKey])

  // Taxa de economia: sem receita no período não existe taxa (mostra "—", nunca 0% enganoso).
  // Projetada = tudo do período (realizado + em aberto); realizada = só o que já foi recebido/pago.
  const rateOf = (inc: number, exp: number) => (inc > 0 ? ((inc - exp) / inc) * 100 : null)
  const projectedRate = rateOf(totalIncome, totalExpense)
  const realizedRate = rateOf(totalIncome - openIncome, totalExpense - openExpense)
  const hasOpen = openIncome + openExpense > 0
  const rateText = (r: number | null) => (r === null ? '—' : `${Math.round(r)}%`)
  const openHint = (open: number) => (open > 0 ? `Em aberto: ${formatCentsToBRL(open)}` : 'Tudo já realizado')
  const hasData = (transactions ?? []).length > 0 || loans.length > 0
  const periodLabel = period === ALL_PERIOD ? 'em todo o histórico guardado' : `em ${monthFullLabel(period)}`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Relatórios</h1>
          {!isLoading && hasData && (
            <>
              <p className="mt-1 text-sm text-ink-secondary">
                Taxa de economia{' '}
                <span
                  className={`font-display text-base font-bold ${
                    projectedRate === null ? 'text-ink-primary' : projectedRate >= 0 ? 'text-brand-300' : 'text-danger'
                  }`}
                >
                  {rateText(projectedRate)}
                </span>{' '}
                {periodLabel}
              </p>
              <p className="mt-0.5 max-w-md text-xs text-ink-muted">
                {projectedRate === null
                  ? 'Sem receitas no período para calcular.'
                  : hasOpen
                    ? `Projetada: inclui ${formatCentsToBRL(openIncome)} a receber e ${formatCentsToBRL(openExpense)} a pagar ainda em aberto. Só com o que já foi realizado: ${rateText(realizedRate)}.`
                    : 'Considera apenas valores já realizados.'}
              </p>
            </>
          )}
        </div>
        {!isLoading && hasData && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full sm:w-60">
              <option value={ALL_PERIOD}>Todo o histórico</option>
              {periodOptions.map((key) => (
                <option key={key} value={key}>
                  {monthFullLabel(key)}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" onClick={() => guard('pdf') && setPdfOpen(true)} className="h-12 shrink-0">
              <FileDown className="h-4 w-4" />
              Gerar PDF
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !hasData ? (
        <EmptyState icon={<Inbox className="h-8 w-8" />} title="Sem dados suficientes para gerar relatórios" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label={period === ALL_PERIOD ? 'Total de receitas' : 'Receitas do mês'}
              value={formatCentsToBRL(totalIncome)}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="positive"
              trend={incomeTrend}
              hint={`${openHint(openIncome)}${incomeTrend ? ' · vs. mês anterior' : ''}`}
            />
            <StatCard
              label={period === ALL_PERIOD ? 'Total de despesas' : 'Despesas do mês'}
              value={formatCentsToBRL(totalExpense)}
              icon={<TrendingDown className="h-5 w-5" />}
              tone="danger"
              trend={expenseTrend}
              hint={`${openHint(openExpense)}${expenseTrend ? ' · vs. mês anterior' : ''}`}
            />
            <StatCard
              label="Taxa de economia"
              value={rateText(projectedRate)}
              icon={<PiggyBank className="h-5 w-5" />}
              tone="neutral"
              hint={hasOpen ? `Projetada · só realizado: ${rateText(realizedRate)}` : 'Realizada · (receitas − despesas) / receitas'}
            />
            <StatCard
              label="Maior despesa"
              value={biggestExpense ? formatCentsToBRL(biggestExpense.amount_cents) : '—'}
              icon={<Receipt className="h-5 w-5" />}
              tone={biggestExpense ? 'danger' : 'neutral'}
              hint={biggestExpense ? `${biggestExpense.description} · ${biggestExpense.category?.name ?? 'Sem categoria'}` : 'Sem despesas no período'}
            />
            <StatCard
              label={avgLabel}
              value={formatCentsToBRL(avgExpenseCents)}
              icon={<CalendarRange className="h-5 w-5" />}
              tone={avgExpenseCents > 0 ? 'danger' : 'neutral'}
              hint={
                period === ALL_PERIOD
                  ? `${monthTotals.size} mês(es) considerados`
                  : period === currentKey
                    ? `${now.getDate()} dias decorridos até hoje`
                    : `${daysInMonth(period)} dias no mês`
              }
            />
            <StatCard
              label="Sobra do período"
              value={formatCentsToBRL(netCents)}
              icon={<Wallet className="h-5 w-5" />}
              tone={netCents > 0 ? 'positive' : netCents < 0 ? 'danger' : 'neutral'}
              hint={`Receitas − despesas${hasOpen ? ' (inclui em aberto)' : ''}`}
            />
          </div>

          {predictedOfPeriod.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Repeat className="h-3.5 w-3.5 text-brand-300" />
                Previsto de recorrências em {monthFullLabel(period)}
              </div>
              <p className="text-sm text-ink-primary">
                {predictedExpense > 0 && (
                  <>
                    Despesas estimadas: <span className="font-semibold text-danger">~{formatCentsToBRL(predictedExpense)}</span>
                  </>
                )}
                {predictedExpense > 0 && predictedIncome > 0 && ' · '}
                {predictedIncome > 0 && (
                  <>
                    Receitas estimadas: <span className="font-semibold text-positive">~{formatCentsToBRL(predictedIncome)}</span>
                  </>
                )}
                {predictedExpense === 0 && predictedIncome === 0 && 'Ocorrências esperadas, sem valor previsto.'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {predictedOfPeriod.length} {predictedOfPeriod.length === 1 ? 'ocorrência prevista' : 'ocorrências previstas'}
                {predictedNoValue > 0 ? ` (${predictedNoValue} sem valor)` : ''}. Estimativa pela média: não está incluída nos totais, na taxa de economia nem na sobra acima. Entra nos números só depois que você informa o valor em Movimentações.
              </p>
            </Card>
          )}

          {periodInsights.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Sparkles className="h-3.5 w-3.5 text-brand-300" />
                Análise de {monthFullLabel(period)}
              </div>
              <ul className="flex flex-col gap-2.5">
                {periodInsights.map((insight) => (
                  <li key={insight.id} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        insight.tone === 'brand' ? 'bg-brand-300' : insight.tone === 'danger' ? 'bg-danger' : 'bg-violet-400'
                      }`}
                    />
                    <span className="text-ink-primary">{insight.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <ChartCard title="Receitas x despesas por mês">
            <IncomeExpenseBarChart data={monthlyBars} />
          </ChartCard>

          <ChartCard
            title={`Distribuição por categoria · ${period === ALL_PERIOD ? 'todo o histórico' : monthFullLabel(period)}`}
            action={
              <Select
                value={categoryType}
                onChange={(e) => setCategoryType(e.target.value as 'expense' | 'income')}
                className="h-9 w-40 text-xs"
              >
                <option value="expense">Despesas</option>
                <option value="income">Receitas</option>
              </Select>
            }
          >
            {categorySlices.length > 0 ? (
              <CategoryDonutChart data={categorySlices} />
            ) : (
              <EmptyState title="Sem dados para o período" />
            )}
          </ChartCard>

          <ChartCard title={`Movimentações quitadas · ${period === ALL_PERIOD ? 'todo o histórico' : monthFullLabel(period)}`}>
            {settledList.length > 0 && (
              <div className="mb-3 flex flex-col gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    value={fSearch}
                    onChange={(e) => setFSearch(e.target.value)}
                    placeholder="Buscar por descrição"
                    className="h-11 w-full rounded-2xl border border-border bg-surface pl-11 pr-4 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Select value={fType} onChange={(e) => setFType(e.target.value as typeof fType)} className="h-11 text-sm">
                    <option value="all">Tipo: todos</option>
                    <option value="income">Só receitas</option>
                    <option value="expense">Só despesas</option>
                  </Select>
                  <Select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="h-11 text-sm">
                    <option value="all">Categorias</option>
                    {settledCategories.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <Select value={fAccount} onChange={(e) => setFAccount(e.target.value)} className="h-11 text-sm">
                    <option value="all">Contas</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
                      </option>
                    ))}
                  </Select>
                  <Select value={fSort} onChange={(e) => setFSort(e.target.value as typeof fSort)} className="h-11 text-sm">
                    <option value="date_desc">Mais recentes</option>
                    <option value="date_asc">Mais antigas</option>
                    <option value="amount_desc">Maior valor</option>
                    <option value="amount_asc">Menor valor</option>
                  </Select>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-secondary">
                  <span>
                    {filteredSettled.length} {filteredSettled.length === 1 ? 'movimentação' : 'movimentações'} ·{' '}
                    <span className={filteredNet >= 0 ? 'font-semibold text-positive' : 'font-semibold text-danger'}>
                      {formatCentsToBRL(filteredNet)}
                    </span>
                  </span>
                  {hasSettledFilters && (
                    <button
                      onClick={() => {
                        setFSearch('')
                        setFType('all')
                        setFCategory('all')
                        setFAccount('all')
                      }}
                      className="font-semibold text-brand-300 hover:text-brand-200"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            )}
            {filteredSettled.length > 0 ? (
              <div className="flex flex-col">
                {filteredSettled.map((t) => (
                  <TransactionListItem key={t.id} transaction={t} onClick={() => setEditing(t)} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={settledList.length > 0 ? 'Nenhuma movimentação com esses filtros' : 'Nenhuma movimentação quitada no período'}
              />
            )}
          </ChartCard>

          <ChartCard title={`Empréstimos quitados · ${period === ALL_PERIOD ? 'todo o histórico' : monthFullLabel(period)}`}>
            {settledLoans.length > 0 && (
              <div className="mb-3 flex flex-col gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    value={lSearch}
                    onChange={(e) => setLSearch(e.target.value)}
                    placeholder="Buscar por pessoa"
                    className="h-11 w-full rounded-2xl border border-border bg-surface pl-11 pr-4 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={lDirection} onChange={(e) => setLDirection(e.target.value as typeof lDirection)} className="h-11 text-sm">
                    <option value="all">Tipo: todos</option>
                    <option value="lent">Só emprestei</option>
                    <option value="borrowed">Só peguei</option>
                  </Select>
                  <Select value={lSort} onChange={(e) => setLSort(e.target.value as typeof lSort)} className="h-11 text-sm">
                    <option value="recent">Quitados há pouco</option>
                    <option value="oldest">Quitados há mais tempo</option>
                    <option value="amount_desc">Maior valor</option>
                    <option value="amount_asc">Menor valor</option>
                  </Select>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-secondary">
                  <span>
                    {filteredSettledLoans.length} {filteredSettledLoans.length === 1 ? 'empréstimo' : 'empréstimos'} ·{' '}
                    <span className="font-semibold text-ink-primary">{formatCentsToBRL(filteredLoansTotal)}</span>
                  </span>
                  {hasLoanFilters && (
                    <button
                      onClick={() => {
                        setLSearch('')
                        setLDirection('all')
                      }}
                      className="font-semibold text-brand-300 hover:text-brand-200"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            )}
            {filteredSettledLoans.length > 0 ? (
              <div className="flex flex-col">
                {filteredSettledLoans.map((loan) => (
                  <SettledLoanRow
                    key={loan.id}
                    loan={loan}
                    settledDate={lastPaymentByLoan.get(loan.id)?.date}
                    onUndo={() => setUndoingLoan(loan)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<HandCoins className="h-7 w-7" />}
                title={settledLoans.length > 0 ? 'Nenhum empréstimo com esses filtros' : 'Nenhum empréstimo quitado no período'}
              />
            )}
          </ChartCard>

          <Modal open={pdfOpen} onClose={() => setPdfOpen(false)} title="Exportar lançamentos">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-secondary">
                Período: <span className="font-semibold text-ink-primary">{period === ALL_PERIOD ? 'Todo o histórico' : monthFullLabel(period)}</span>
                . Usa os filtros da seção "Movimentações quitadas" (tipo, categoria, conta, busca e ordem).
              </p>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink-secondary">Quais lançamentos incluir</span>
                {(
                  [
                    ['both', 'Em aberto e quitadas'],
                    ['open', 'Só em aberto'],
                    ['settled', 'Só quitadas'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm font-medium text-ink-primary ${
                      pdfSituation === value ? 'border-brand-400/60 bg-brand-500/15' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pdf-situation"
                      checked={pdfSituation === value}
                      onChange={() => setPdfSituation(value)}
                      className="h-4 w-4 accent-[rgb(var(--a-500))]"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-ink-muted">
                {pdfRows.length} {pdfRows.length === 1 ? 'lançamento será incluído' : 'lançamentos serão incluídos'} · {filtersText}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setPdfOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" variant="secondary" className="flex-1" disabled={pdfRows.length === 0} onClick={downloadCsv}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Planilha (CSV)
                </Button>
                <Button type="button" className="flex-1" loading={pdfBusy} disabled={pdfRows.length === 0} onClick={downloadPdf}>
                  <FileDown className="h-4 w-4" />
                  Baixar PDF
                </Button>
              </div>
            </div>
          </Modal>

          <TransactionForm
            open={Boolean(editing)}
            onClose={() => setEditing(null)}
            editing={editing}
            onRequestDelete={(t) => {
              setEditing(null)
              setDeleting(t)
            }}
          />

          <ConfirmDialog
            open={Boolean(deleting)}
            title="Excluir movimentação"
            description={`Excluir "${deleting?.description}" (${deleting ? formatCentsToBRL(deleting.amount_cents) : ''})? Isso apaga o lançamento e ajusta o saldo da conta de volta. Não pode ser desfeito.`}
            confirmLabel="Excluir"
            loading={remove.isPending}
            onConfirm={confirmDelete}
            onClose={() => setDeleting(null)}
          />

          <ConfirmDialog
            open={Boolean(undoingLoan)}
            title="Desfazer quitação"
            description={`Desfazer a quitação do empréstimo com "${undoingLoan?.counterparty}" (${undoingLoan ? formatCentsToBRL(undoingLoan.principal_cents) : ''})? Ele volta para Empréstimos como pendente e o saldo da conta é ajustado de volta.`}
            confirmLabel="Desfazer"
            danger={false}
            loading={removePayment.isPending}
            onConfirm={confirmUndoLoan}
            onClose={() => setUndoingLoan(null)}
          />
        </>
      )}
    </div>
  )
}

function SettledLoanRow({ loan, settledDate, onUndo }: { loan: Loan; settledDate?: string; onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-white/[0.03]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-ink-primary">{loan.counterparty}</p>
          <Badge tone={loan.direction === 'lent' ? 'brand' : 'neutral'}>{loan.direction === 'lent' ? 'Emprestei' : 'Peguei'}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-ink-secondary">
          {formatDate(loan.date)}
          {settledDate && ` · Quitado em ${formatDate(settledDate)}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-display font-bold text-ink-primary">{formatCentsToBRL(loan.principal_cents)}</span>
        <button onClick={onUndo} className="text-[11px] font-medium text-ink-muted hover:text-brand-300">
          Desfazer
        </button>
      </div>
    </div>
  )
}
