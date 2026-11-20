import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, HandCoins, PlusCircle, CheckCheck, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { CurrencyInput } from '../components/ui/CurrencyInput'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAccounts } from '../lib/queries/useAccounts'
import { ACCOUNT_TYPE_LABELS } from '../lib/accountTypes'
import { useLoans, useLoanMutations, useLoanPayments, useAllLoanPayments, type LoanInput } from '../lib/queries/useLoans'
import { supabase } from '../lib/supabase'
import { useFeatureGate } from '../lib/useFeatureGate'
import { useToast } from '../components/ui/Toast'
import { formatCentsToBRL, formatDate, todayISO } from '../lib/format'
import type { Loan, LoanDirection } from '../types/database'

const schema = z.object({
  account_id: z.string().min(1, 'Selecione uma conta'),
  counterparty: z.string().min(1, 'Informe o nome'),
  direction: z.enum(['lent', 'borrowed']),
  principalCents: z.number().refine((v) => v > 0, 'Informe um valor maior que zero'),
  date: z.string().min(1),
  dueDate: z.string().optional(),
  note: z.string().max(200).optional(),
})
type FormValues = z.infer<typeof schema>

export function LoansPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: loans, isLoading, isError, refetch } = useLoans()
  const { create, update, archive, remove, registerPayment, payOff } = useLoanMutations()
  const { data: allPayments = [] } = useAllLoanPayments()
  const toast = useToast()
  const guard = useFeatureGate()

  const [formOpen, setFormOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [detail, setDetail] = useState<Loan | null>(null)
  const [archiving, setArchiving] = useState<Loan | null>(null)
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [personName, setPersonName] = useState<string | null>(null)
  const [payingOff, setPayingOff] = useState<LoanDirection | 'all' | null>(null)
  const [partialDirection, setPartialDirection] = useState<LoanDirection | null>(null)
  const [partialAmount, setPartialAmount] = useState(0)
  // conta em que o pagamento/recebimento cai ('' = a mais usada pelos empréstimos da pessoa)
  const [payAccountId, setPayAccountId] = useState('')
  const [detailPayAccountId, setDetailPayAccountId] = useState('')

  function openPerson(name: string) {
    setPartialDirection(null)
    setPartialAmount(0)
    setPayAccountId('')
    setPersonName(name)
  }

  const { data: payments = [] } = useLoanPayments(detail?.id)
  useEffect(() => setDetailPayAccountId(''), [detail?.id])
  const { data: editingPayments = [] } = useLoanPayments(editingLoan?.id)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      account_id: '',
      counterparty: '',
      direction: 'lent',
      principalCents: 0,
      date: todayISO(),
      dueDate: '',
      note: '',
    },
  })

  function openEdit(loan: Loan) {
    setDetail(null)
    setEditingLoan(loan)
    reset({
      account_id: loan.account_id,
      counterparty: loan.counterparty,
      direction: loan.direction,
      principalCents: loan.principal_cents,
      date: loan.date,
      dueDate: loan.due_date ?? '',
      note: loan.note ?? '',
    })
    setFormOpen(true)
  }

  function openCreate() {
    if (!guard('loans')) return
    setEditingLoan(null)
    reset({
      account_id: accounts[0]?.id ?? '',
      counterparty: '',
      direction: 'lent',
      principalCents: 0,
      date: todayISO(),
      dueDate: '',
      note: '',
    })
    setFormOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const input: LoanInput = {
      account_id: values.account_id,
      counterparty: values.counterparty,
      direction: values.direction,
      principal_cents: values.principalCents,
      date: values.date,
      due_date: values.dueDate || null,
      note: values.note?.trim() ? values.note.trim() : null,
    }
    try {
      if (editingLoan) {
        const alreadyPaid = editingPayments.reduce((s, p) => s + p.amount_cents, 0)
        if (input.principal_cents < alreadyPaid) {
          toast.error(`O valor não pode ser menor que o já devolvido (${formatCentsToBRL(alreadyPaid)}).`)
          return
        }
        await update.mutateAsync({ id: editingLoan.id, input })
        toast.success('Empréstimo atualizado e saldo ajustado.')
      } else {
        await create.mutateAsync(input)
        toast.success('Empréstimo registrado.')
      }
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar empréstimo.')
    }
  }

  // pendente = valor emprestado - o que já foi devolvido (soma de todos os pagamentos do empréstimo)
  const paidByLoan = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of allPayments) m.set(p.loan_id, (m.get(p.loan_id) ?? 0) + p.amount_cents)
    return m
  }, [allPayments])
  const pendingOf = (loan: Loan) => Math.max(0, loan.principal_cents - (paidByLoan.get(loan.id) ?? 0))
  const totalPending = (loans ?? []).reduce((s, l) => s + pendingOf(l), 0)
  const openLoansCount = (loans ?? []).filter((l) => pendingOf(l) > 0).length

  // ---- detalhe da pessoa + quitação em lote ----
  // só o que está em aberto — quitado sai daqui e vai pro histórico em Relatórios (mesmo padrão de Movimentações)
  const personLoans = useMemo(
    () => (personName ? (loans ?? []).filter((l) => l.counterparty === personName && pendingOf(l) > 0) : []),
    [loans, personName, paidByLoan],
  )
  const pendingLent = personLoans.filter((l) => l.direction === 'lent').reduce((s, l) => s + pendingOf(l), 0)
  const pendingBorrowed = personLoans.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + pendingOf(l), 0)
  // contas que podem receber/pagar (cartão de crédito não entra: quem paga fatura é a transferência)
  const payableAccounts = accounts.filter((a) => !a.archived && a.type !== 'credit_card')
  const defaultPayAccountId = useMemo(() => {
    const count = new Map<string, number>()
    for (const l of personLoans) count.set(l.account_id, (count.get(l.account_id) ?? 0) + 1)
    const best = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).find((id) => payableAccounts.some((a) => a.id === id))
    return best ?? payableAccounts[0]?.id ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personLoans, accounts])
  const effectivePayAccountId = payableAccounts.some((a) => a.id === payAccountId) ? payAccountId : defaultPayAccountId
  const plan = payingOff
    ? personLoans
        .filter((l) => (payingOff === 'all' || l.direction === payingOff) && pendingOf(l) > 0)
        .map((l) => ({ loan: l, amountCents: pendingOf(l) }))
    : []
  // efeito esperado no saldo de cada conta: lent → entra (+), borrowed → sai (-)
  const planByAccount = new Map<string, number>()
  for (const { loan, amountCents } of plan) {
    const target = effectivePayAccountId || loan.account_id
    planByAccount.set(target, (planByAccount.get(target) ?? 0) + (loan.direction === 'lent' ? amountCents : -amountCents))
  }
  const signed = (cents: number) => `${cents >= 0 ? '+' : '-'}${formatCentsToBRL(Math.abs(cents))}`
  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Conta'
  const planEffect = Array.from(planByAccount.entries())
    .map(([id, delta]) => `${accountLabel(id)} ${signed(delta)}`)
    .join(' · ')

  // pagamento parcial do total da pessoa: distribui o valor digitado entre os empréstimos daquela direção,
  // do vencimento mais antigo para o mais novo, até acabar o valor — não precisa abrir um por um
  const effectivePartialDirection: LoanDirection | null =
    partialDirection ?? (pendingLent > 0 && pendingBorrowed === 0 ? 'lent' : pendingBorrowed > 0 && pendingLent === 0 ? 'borrowed' : null)
  const pendingForPartial = effectivePartialDirection === 'lent' ? pendingLent : effectivePartialDirection === 'borrowed' ? pendingBorrowed : 0
  const partialAllocation = useMemo(() => {
    if (!effectivePartialDirection || partialAmount <= 0) return [] as { loan: Loan; amountCents: number }[]
    const ordered = personLoans
      .filter((l) => l.direction === effectivePartialDirection && pendingOf(l) > 0)
      .sort((a, b) => (a.due_date ?? a.date).localeCompare(b.due_date ?? b.date))
    let remaining = Math.min(partialAmount, pendingForPartial)
    const items: { loan: Loan; amountCents: number }[] = []
    for (const loan of ordered) {
      if (remaining <= 0) break
      const amountCents = Math.min(pendingOf(loan), remaining)
      items.push({ loan, amountCents })
      remaining -= amountCents
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePartialDirection, partialAmount, personLoans, pendingForPartial])

  async function submitPartial() {
    if (partialAllocation.length === 0) return
    try {
      await payOff.mutateAsync(partialAllocation.map((p) => ({ loanId: p.loan.id, amountCents: p.amountCents, accountId: effectivePayAccountId !== p.loan.account_id ? effectivePayAccountId : null })))
      const fullySettled = partialAllocation.filter((p) => p.amountCents >= pendingOf(p.loan)).length
      toast.success(
        `Pagamento de ${formatCentsToBRL(Math.min(partialAmount, pendingForPartial))} registrado em ${partialAllocation.length} ${
          partialAllocation.length === 1 ? 'empréstimo' : 'empréstimos'
        }${fullySettled > 0 ? ` (${fullySettled} quitado${fullySettled === 1 ? '' : 's'})` : ''}.`,
      )
      setPartialAmount(0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar pagamento.')
    }
  }

  async function confirmPayOff() {
    if (!payingOff || plan.length === 0) {
      setPayingOff(null)
      return
    }
    const accountIds = Array.from(planByAccount.keys())
    const before = new Map(accounts.map((a) => [a.id, a.balance_cents]))
    try {
      await payOff.mutateAsync(plan.map((p) => ({ loanId: p.loan.id, amountCents: p.amountCents, accountId: effectivePayAccountId !== p.loan.account_id ? effectivePayAccountId : null })))
      // conferência: lê o saldo real no banco e compara com o esperado
      const { data: fresh, error } = await supabase.from('accounts').select('id, balance_cents').in('id', accountIds)
      if (error) throw new Error(error.message)
      const mismatched = (fresh ?? []).filter(
        (a) => a.balance_cents - (before.get(a.id) ?? 0) !== (planByAccount.get(a.id) ?? 0),
      )
      if (mismatched.length > 0) {
        toast.error('Quitado, mas o saldo de uma conta não bateu com o esperado. Confira em Contas.')
      } else {
        toast.success(`Quitado. Saldo atualizado: ${planEffect}`)
      }
      setPayingOff(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao quitar.')
    }
  }

  // só em aberto aqui — quitado sai dos Empréstimos e vai pro histórico em Relatórios (mesmo padrão de Movimentações)
  const groupedByPerson = useMemo(() => {
    const map = new Map<string, Loan[]>()
    for (const loan of loans ?? []) {
      if (pendingOf(loan) === 0) continue
      map.set(loan.counterparty, [...(map.get(loan.counterparty) ?? []), loan])
    }
    return Array.from(map.entries())
      .map(([counterparty, items]) => ({
        counterparty,
        items,
        latestKey: items.reduce((max, l) => (l.due_date ?? l.date) > max ? (l.due_date ?? l.date) : max, ''),
      }))
      .sort((a, b) => b.latestKey.localeCompare(a.latestKey))
  }, [loans, paidByLoan])

  const paidForDetail = payments.reduce((s, p) => s + p.amount_cents, 0)
  const pendingForDetail = detail ? Math.max(0, detail.principal_cents - paidForDetail) : 0
  const detailAccount = detail ? accounts.find((a) => a.id === detail.account_id) : undefined
  const detailTargetAccountId =
    detail && payableAccounts.some((a) => a.id === detailPayAccountId)
      ? detailPayAccountId
      : detail && payableAccounts.some((a) => a.id === detail.account_id)
        ? detail.account_id
        : (payableAccounts[0]?.id ?? '')

  async function submitPayment() {
    if (!detail || payAmount <= 0) return
    try {
      await registerPayment.mutateAsync({
        loanId: detail.id,
        amountCents: Math.min(payAmount, pendingForDetail),
        date: todayISO(),
        accountId: detailTargetAccountId !== detail.account_id ? detailTargetAccountId : null,
      })
      toast.success('Pagamento registrado.')
      setPayAmount(0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar pagamento.')
    }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await archive.mutateAsync(archiving.id)
      toast.success('Empréstimo arquivado.')
      setArchiving(null)
      setDetail(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao arquivar.')
    }
  }

  async function confirmDeleteLoan() {
    if (!deletingLoan) return
    try {
      await remove.mutateAsync(deletingLoan.id)
      toast.success('Empréstimo excluído e saldo ajustado.')
      setDeletingLoan(null)
      setDetail(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Empréstimos</h1>
          {!isLoading && openLoansCount > 0 && (
            <p className="mt-1 text-sm text-ink-secondary">
              <span className="font-display text-base font-bold text-ink-primary">{formatCentsToBRL(totalPending)}</span> pendente em{' '}
              {openLoansCount} {openLoansCount === 1 ? 'empréstimo' : 'empréstimos'}
            </p>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {isError && (
        <EmptyState title="Não foi possível carregar os empréstimos" action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />
      )}

      {!isLoading && !isError && loans && openLoansCount === 0 && (
        <EmptyState
          icon={<HandCoins className="h-8 w-8" />}
          title={loans.length === 0 ? 'Nenhum empréstimo registrado' : 'Nenhum empréstimo em aberto'}
          description={
            loans.length === 0
              ? 'Registre quando você emprestar ou pegar dinheiro emprestado.'
              : 'Os quitados ficam no histórico, em Relatórios.'
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo empréstimo
            </Button>
          }
        />
      )}

      {!isLoading && !isError && loans && openLoansCount > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {groupedByPerson.map((group) => (
            <PersonLoanCard
              key={group.counterparty}
              counterparty={group.counterparty}
              items={group.items}
              pendingOf={pendingOf}
              onSelectPerson={openPerson}
              onSelectLoan={setDetail}
            />
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingLoan ? 'Editar empréstimo' : 'Novo empréstimo'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
            {(
              [
                { value: 'lent', label: 'Eu emprestei' },
                { value: 'borrowed', label: 'Peguei emprestado' },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className="cursor-pointer rounded-xl py-2 text-center text-sm font-semibold text-ink-secondary [&:has(:checked)]:bg-brand-gradient [&:has(:checked)]:text-[#04241c]"
              >
                <input type="radio" value={opt.value} className="hidden" {...register('direction')} />
                {opt.label}
              </label>
            ))}
          </div>
          <Input label="Nome da pessoa" placeholder="Ex: João" error={errors.counterparty?.message} {...register('counterparty')} />
          <Controller
            control={control}
            name="principalCents"
            render={({ field }) => (
              <CurrencyInput label="Valor" valueCents={field.value} onValueChange={field.onChange} error={errors.principalCents?.message} />
            )}
          />
          <Select label="Conta" error={errors.account_id?.message} {...register('account_id')}>
            <option value="">Selecione</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data" type="date" {...register('date')} />
            <Input label="Vencimento (opcional)" type="date" {...register('dueDate')} />
          </div>
          <Input label="Observação (opcional)" {...register('note')} />
          <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
            {editingLoan ? 'Salvar alterações' : 'Registrar'}
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(personName)} onClose={() => setPersonName(null)} title={personName ?? ''}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="glass rounded-2xl p-3">
              <p className="text-[11px] text-ink-secondary">A receber</p>
              <p className="font-display text-base font-bold text-positive">{formatCentsToBRL(pendingLent)}</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="text-[11px] text-ink-secondary">A pagar</p>
              <p className="font-display text-base font-bold text-danger">{formatCentsToBRL(pendingBorrowed)}</p>
            </div>
          </div>

          {pendingLent > 0 && pendingBorrowed > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setPayingOff('lent')}>
                <CheckCheck className="h-4 w-4" /> Receber {formatCentsToBRL(pendingLent)}
              </Button>
              <Button variant="secondary" onClick={() => setPayingOff('borrowed')}>
                <CheckCheck className="h-4 w-4" /> Pagar {formatCentsToBRL(pendingBorrowed)}
              </Button>
            </div>
          ) : pendingLent + pendingBorrowed > 0 ? (
            <Button size="lg" className="w-full" onClick={() => setPayingOff('all')}>
              <CheckCheck className="h-4 w-4" /> Quitar tudo · {formatCentsToBRL(pendingLent + pendingBorrowed)}
            </Button>
          ) : (
            <p className="rounded-2xl border border-border p-3 text-center text-sm text-ink-secondary">Tudo quitado com {personName}.</p>
          )}

          {(pendingLent > 0 || pendingBorrowed > 0) && payableAccounts.length > 0 && (
            <Select
              label={pendingLent > 0 && pendingBorrowed > 0 ? 'Conta do pagamento' : pendingLent > 0 ? 'Receber na conta' : 'Pagar com a conta'}
              value={effectivePayAccountId}
              onChange={(e) => setPayAccountId(e.target.value)}
            >
              {payableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {ACCOUNT_TYPE_LABELS[a.type]} · {formatCentsToBRL(a.balance_cents)}
                </option>
              ))}
            </Select>
          )}

          {(pendingLent > 0 || pendingBorrowed > 0) && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Registrar pagamento (valor parcial)</h4>

              {pendingLent > 0 && pendingBorrowed > 0 && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
                  {(
                    [
                      { value: 'lent' as const, label: 'Recebi' },
                      { value: 'borrowed' as const, label: 'Paguei' },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPartialDirection(opt.value)}
                      className={`rounded-lg py-1.5 text-center text-xs font-semibold transition-colors ${
                        effectivePartialDirection === opt.value ? 'bg-brand-gradient text-[#04241c]' : 'text-ink-secondary hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {effectivePartialDirection ? (
                <>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <CurrencyInput valueCents={partialAmount} onValueChange={setPartialAmount} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setPartialAmount(pendingForPartial)}
                      className="h-14 shrink-0 rounded-2xl border border-border px-3 text-xs font-semibold text-ink-secondary hover:bg-white/5"
                    >
                      Tudo ({formatCentsToBRL(pendingForPartial)})
                    </button>
                  </div>
                  <p className="text-xs text-ink-secondary">
                    {partialAllocation.length > 0
                      ? `Aplicado do empréstimo mais antigo para o mais novo: quita ${partialAllocation.length} de ${personLoans.filter((l) => l.direction === effectivePartialDirection && pendingOf(l) > 0).length} lançamento(s).`
                      : 'O valor é distribuído automaticamente entre os lançamentos dessa pessoa, do mais antigo para o mais novo.'}
                  </p>
                  <Button onClick={submitPartial} loading={payOff.isPending} disabled={partialAllocation.length === 0}>
                    <PlusCircle className="h-4 w-4" /> Registrar pagamento
                  </Button>
                </>
              ) : (
                <p className="text-xs text-ink-secondary">Escolha acima se o pagamento é do que você recebeu ou pagou.</p>
              )}
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Empréstimos</h4>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {personLoans.map((loan) => {
                const pending = pendingOf(loan)
                return (
                  <button
                    key={loan.id}
                    onClick={() => {
                      setPersonName(null)
                      setDetail(loan)
                    }}
                    className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate text-ink-secondary">
                      {formatDate(loan.date)} · {loan.direction === 'lent' ? 'Emprestei' : 'Peguei'}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className={`font-semibold ${pending === 0 ? 'text-ink-muted' : loan.direction === 'lent' ? 'text-brand-300' : 'text-ink-primary'}`}>
                        {pending === 0 ? 'Quitado' : formatCentsToBRL(pending)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-ink-muted" />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(payingOff) && plan.length > 0}
        title={payingOff === 'borrowed' ? 'Pagar tudo' : payingOff === 'lent' ? 'Receber tudo' : 'Quitar tudo'}
        description={`Registrar a quitação de ${plan.length} ${plan.length === 1 ? 'empréstimo' : 'empréstimos'} com "${personName}"? Efeito no saldo: ${planEffect}.`}
        confirmLabel="Confirmar quitação"
        danger={false}
        loading={payOff.isPending}
        onConfirm={confirmPayOff}
        onClose={() => setPayingOff(null)}
      />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.counterparty ?? ''}>
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.direction === 'lent' ? 'brand' : 'neutral'}>
                {detail.direction === 'lent' ? 'Emprestei' : 'Peguei emprestado'}
              </Badge>
              {detail.due_date && pendingForDetail > 0 && (
                <Badge tone={detail.due_date < todayISO() ? 'danger' : 'neutral'}>
                  {detail.due_date < todayISO() ? 'Venceu em' : 'Vence em'} {formatDate(detail.due_date)}
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-secondary">Data</span>
                <span className="font-medium text-ink-primary">{formatDate(detail.date)}</span>
              </div>
              {detail.due_date && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-secondary">Vencimento</span>
                  <span className="font-medium text-ink-primary">{formatDate(detail.due_date)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-secondary">Conta</span>
                <span className="font-medium text-ink-primary">
                  {detailAccount ? `${detailAccount.name} · ${ACCOUNT_TYPE_LABELS[detailAccount.type]}` : '—'}
                </span>
              </div>
              {detail.note && (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-ink-secondary">Observação</span>
                  <span className="text-right font-medium text-ink-primary">{detail.note}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="glass rounded-2xl p-3">
                <p className="text-[11px] text-ink-secondary">Total</p>
                <p className="font-display text-sm font-bold text-ink-primary">{formatCentsToBRL(detail.principal_cents)}</p>
              </div>
              <div className="glass rounded-2xl p-3">
                <p className="text-[11px] text-ink-secondary">Devolvido</p>
                <p className="font-display text-sm font-bold text-positive">{formatCentsToBRL(paidForDetail)}</p>
              </div>
              <div className="glass rounded-2xl p-3">
                <p className="text-[11px] text-ink-secondary">Pendente</p>
                <p className="font-display text-sm font-bold text-danger">{formatCentsToBRL(pendingForDetail)}</p>
              </div>
            </div>

            {pendingForDetail > 0 && payableAccounts.length > 0 && (
              <Select
                label={detail.direction === 'lent' ? 'Receber na conta' : 'Pagar com a conta'}
                value={detailTargetAccountId}
                onChange={(e) => setDetailPayAccountId(e.target.value)}
              >
                {payableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {ACCOUNT_TYPE_LABELS[a.type]} · {formatCentsToBRL(a.balance_cents)}
                  </option>
                ))}
              </Select>
            )}

            {pendingForDetail > 0 && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <CurrencyInput label="Registrar pagamento" valueCents={payAmount} onValueChange={setPayAmount} />
                </div>
                <Button className="self-end" onClick={submitPayment} loading={registerPayment.isPending} disabled={payAmount <= 0}>
                  <PlusCircle className="h-4 w-4" /> Registrar
                </Button>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Histórico</h4>
              {payments.length === 0 ? (
                <p className="text-sm text-ink-secondary">Nenhum pagamento registrado ainda.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm">
                      <span className="min-w-0 truncate text-ink-secondary">
                        {formatDate(p.date)} · {accountLabel(p.account_id ?? detail.account_id)}
                      </span>
                      <span className="shrink-0 font-semibold text-positive">+{formatCentsToBRL(p.amount_cents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <button
                onClick={() => openEdit(detail)}
                className="self-start text-sm font-medium text-brand-300 hover:text-brand-200"
              >
                Editar empréstimo
              </button>
              <button
                onClick={() => {
                  setArchiving(detail)
                }}
                className="self-start text-sm font-medium text-ink-secondary hover:text-ink-primary"
              >
                Arquivar empréstimo
              </button>
              <button
                onClick={() => {
                  setDeletingLoan(detail)
                }}
                className="self-start text-sm font-medium text-danger hover:text-danger/80"
              >
                Excluir empréstimo
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar empréstimo"
        description={`Arquivar o empréstimo com "${archiving?.counterparty}"? O histórico é preservado — dá pra ver de novo ativando a exibição de arquivados.`}
        confirmLabel="Arquivar"
        loading={archive.isPending}
        onConfirm={confirmArchive}
        onClose={() => setArchiving(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingLoan)}
        title="Excluir empréstimo"
        description={`Excluir o empréstimo com "${deletingLoan?.counterparty}" (${deletingLoan ? formatCentsToBRL(deletingLoan.principal_cents) : ''})? Isso apaga o lançamento e o histórico de pagamentos permanentemente e ajusta o saldo da conta de volta. Diferente de arquivar, não pode ser desfeito.`}
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={confirmDeleteLoan}
        onClose={() => setDeletingLoan(null)}
      />
    </div>
  )
}

function PersonLoanCard({
  counterparty,
  items,
  pendingOf,
  onSelectPerson,
  onSelectLoan,
}: {
  counterparty: string
  items: Loan[]
  pendingOf: (loan: Loan) => number
  onSelectPerson: (counterparty: string) => void
  onSelectLoan: (loan: Loan) => void
}) {
  // totais PENDENTES (valor - já devolvido), não o valor original
  const lentTotal = items.filter((l) => l.direction === 'lent').reduce((s, l) => s + pendingOf(l), 0)
  const borrowedTotal = items.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + pendingOf(l), 0)
  const settled = lentTotal + borrowedTotal === 0
  const mixed = lentTotal > 0 && borrowedTotal > 0
  const sorted = [...items].sort((a, b) => (b.due_date ?? b.date).localeCompare(a.due_date ?? a.date))

  return (
    <Card className="p-4 sm:p-5">
      {/* tocar aqui abre o total da pessoa, com quitação de todos os empréstimos de uma vez */}
      <button
        type="button"
        onClick={() => onSelectPerson(counterparty)}
        className="-m-1 block w-[calc(100%+0.5rem)] rounded-2xl p-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
              <HandCoins className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-primary">{counterparty}</p>
              <p className="text-xs text-ink-secondary">
                {items.length} {items.length === 1 ? 'empréstimo' : 'empréstimos'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!mixed && !settled && <Badge tone={lentTotal > 0 ? 'brand' : 'neutral'}>{lentTotal > 0 ? 'Emprestei' : 'Peguei'}</Badge>}
            {settled && <Badge tone="neutral">Quitado</Badge>}
            <ChevronRight className="h-4 w-4 text-ink-muted" />
          </div>
        </div>

        {mixed ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-[11px] text-ink-secondary">A receber</p>
              <p className="font-display text-lg font-bold text-positive">{formatCentsToBRL(lentTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-secondary">A pagar</p>
              <p className="font-display text-lg font-bold text-danger">{formatCentsToBRL(borrowedTotal)}</p>
            </div>
          </div>
        ) : (
          <p className={`mt-4 text-2xl font-bold ${settled ? 'text-ink-muted' : 'text-ink-primary'}`}>
            {formatCentsToBRL(lentTotal + borrowedTotal)}
          </p>
        )}
      </button>

      <div className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-3">
        {sorted.map((loan) => {
          const overdue = Boolean(loan.due_date && loan.due_date < todayISO())
          return (
            <button
              key={loan.id}
              onClick={() => onSelectLoan(loan)}
              className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-xs transition-colors hover:bg-white/[0.04]"
            >
              <p className="min-w-0 truncate text-ink-secondary">
                {formatDate(loan.date)}
                {loan.due_date && (
                  <span className={overdue ? 'ml-1 font-medium text-danger' : 'ml-1 text-ink-muted'}>
                    · {overdue ? 'venceu' : 'vence'} {formatDate(loan.due_date)}
                  </span>
                )}
              </p>
              <span
                className={`shrink-0 font-semibold ${
                  pendingOf(loan) === 0 ? 'text-ink-muted' : loan.direction === 'lent' ? 'text-brand-300' : 'text-ink-primary'
                }`}
              >
                {pendingOf(loan) === 0 ? 'Quitado' : formatCentsToBRL(pendingOf(loan))}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
