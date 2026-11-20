import { moneyTone } from '../lib/moneyTone'
import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Wallet, ArrowLeftRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { CurrencyInput } from '../components/ui/CurrencyInput'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { IconPicker, ColorPicker } from '../components/ui/IconColorPicker'
import { AccountCard } from '../components/finance/AccountCard'
import { TransferModal } from '../components/finance/TransferModal'
import { InvoiceModal } from '../components/finance/InvoiceModal'
import { useAccounts, useAccountMutations, type AccountInput } from '../lib/queries/useAccounts'
import { useTransactions } from '../lib/queries/useTransactions'
import { useToast } from '../components/ui/Toast'
import { ACCOUNT_TYPE_OPTIONS, currentInvoiceByAccount, totalLiquidBalanceCents } from '../lib/accountTypes'
import { formatCentsToBRL } from '../lib/format'
import type { Account } from '../types/database'

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

const schema = z.object({
  name: z.string().min(1, 'Informe um nome').max(60),
  type: z.enum(['checking', 'savings', 'credit_card', 'wallet', 'investment']),
  color: z.string(),
  icon: z.string(),
  creditLimitCents: z.number().optional(),
  balanceCents: z.number(),
  closingDay: z.number().optional(),
  dueDay: z.number().optional(),
})
type FormValues = z.infer<typeof schema>

export function AccountsPage() {
  const { data: accounts, isLoading, isError, refetch } = useAccounts()
  const { data: transactions = [] } = useTransactions({})
  const { create, update, archive } = useAccountMutations()
  const toast = useToast()
  const invoiceByAccount = useMemo(
    () => currentInvoiceByAccount(transactions, accounts ?? []),
    [transactions, accounts]
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [archiving, setArchiving] = useState<Account | null>(null)
  const [optionsFor, setOptionsFor] = useState<Account | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [invoiceFor, setInvoiceFor] = useState<Account | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: 'checking',
      color: '#2DD4BF',
      icon: 'wallet',
      creditLimitCents: 0,
      balanceCents: 0,
      closingDay: 1,
      dueDay: 10,
    },
  })

  const watchedType = watch('type')

  function openCreate() {
    setEditing(null)
    reset({
      name: '',
      type: 'checking',
      color: '#2DD4BF',
      icon: 'wallet',
      creditLimitCents: 0,
      balanceCents: 0,
      closingDay: 1,
      dueDay: 10,
    })
    setFormOpen(true)
  }

  function openEdit(acc: Account) {
    setOptionsFor(null)
    setEditing(acc)
    reset({
      name: acc.name,
      type: acc.type,
      color: acc.color,
      icon: acc.icon,
      creditLimitCents: acc.credit_limit_cents ?? 0,
      balanceCents: acc.balance_cents,
      closingDay: acc.closing_day ?? 1,
      dueDay: acc.due_day ?? 10,
    })
    setFormOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const isCreditCard = values.type === 'credit_card'
    const input: AccountInput = {
      name: values.name,
      type: values.type,
      color: values.color,
      icon: values.icon,
      credit_limit_cents: isCreditCard ? values.creditLimitCents ?? 0 : null,
      closing_day: isCreditCard ? values.closingDay ?? null : null,
      due_day: isCreditCard ? values.dueDay ?? null : null,
      ...(isCreditCard ? {} : { balance_cents: values.balanceCents }),
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input })
        toast.success('Conta atualizada.')
      } else {
        await create.mutateAsync(input)
        toast.success('Conta criada.')
      }
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar conta.')
    }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await archive.mutateAsync(archiving.id)
      toast.success('Conta arquivada.')
      setArchiving(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao arquivar conta.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Contas e cartões</h1>
          {!isLoading && !isError && accounts && accounts.length > 0 && (
            <p className="mt-1 text-sm text-ink-secondary">
              <span className={`font-display text-base font-bold ${moneyTone(totalLiquidBalanceCents(accounts))}`}>
                {formatCentsToBRL(totalLiquidBalanceCents(accounts))}
              </span>{' '}
              em contas · {accounts.length} {accounts.length === 1 ? 'ativa' : 'ativas'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" />
            Transferir
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova conta
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState title="Não foi possível carregar as contas" action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />
      )}

      {!isLoading && !isError && accounts && accounts.length === 0 && (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Nenhuma conta cadastrada"
          description="Crie uma conta ou cartão para começar a registrar movimentações."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Criar conta
            </Button>
          }
        />
      )}

      {!isLoading && !isError && accounts && accounts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onOptions={() => setOptionsFor(acc)}
              onViewInvoice={acc.type === 'credit_card' ? () => setInvoiceFor(acc) : undefined}
              currentMonthExpenseCents={invoiceByAccount.get(acc.id)?.totalCents ?? 0}
              invoiceDueDate={invoiceByAccount.get(acc.id)?.dueDate ?? null}
            />
          ))}
        </div>
      )}

      <Modal open={Boolean(optionsFor)} onClose={() => setOptionsFor(null)} title={optionsFor?.name ?? ''}>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => optionsFor && openEdit(optionsFor)}
            className="rounded-2xl px-4 py-3 text-left text-sm font-medium text-ink-primary hover:bg-white/5"
          >
            Editar conta
          </button>
          <button
            onClick={() => {
              setArchiving(optionsFor)
              setOptionsFor(null)
            }}
            className="rounded-2xl px-4 py-3 text-left text-sm font-medium text-danger hover:bg-danger-soft"
          >
            Arquivar conta
          </button>
        </div>
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar conta' : 'Nova conta'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input label="Nome" placeholder="Ex: Nubank" error={errors.name?.message} {...register('name')} />
          <Select label="Tipo" error={errors.type?.message} {...register('type')}>
            {ACCOUNT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {watchedType === 'credit_card' ? (
            <p className="rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-xs text-ink-secondary">
              A fatura deste cartão é calculada automaticamente a partir das compras registradas nele — cada compra
              deve ser lançada em "Nova movimentação" (com categoria, data e parcelas se houver).
            </p>
          ) : (
            <Controller
              control={control}
              name="balanceCents"
              render={({ field }) => (
                <CurrencyInput
                  label={editing ? 'Saldo atual' : 'Saldo inicial'}
                  valueCents={field.value}
                  onValueChange={field.onChange}
                />
              )}
            />
          )}
          {watchedType === 'credit_card' && (
            <>
              <Controller
                control={control}
                name="creditLimitCents"
                render={({ field }) => (
                  <CurrencyInput label="Limite do cartão" valueCents={field.value ?? 0} onValueChange={field.onChange} />
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Dia de fechamento" {...register('closingDay', { valueAsNumber: true })}>
                  {DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      Dia {d}
                    </option>
                  ))}
                </Select>
                <Select label="Dia de vencimento" {...register('dueDay', { valueAsNumber: true })}>
                  {DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      Dia {d}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <Controller
            control={control}
            name="icon"
            render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} />}
          />
          <Controller
            control={control}
            name="color"
            render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />}
          />
          <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
            {editing ? 'Salvar alterações' : 'Criar conta'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar conta"
        description={`"${archiving?.name}" será arquivada e deixará de aparecer nas listagens. O histórico é preservado.`}
        confirmLabel="Arquivar"
        loading={archive.isPending}
        onConfirm={confirmArchive}
        onClose={() => setArchiving(null)}
      />

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} accounts={accounts ?? []} />

      <InvoiceModal
        open={Boolean(invoiceFor)}
        onClose={() => setInvoiceFor(null)}
        account={invoiceFor}
        transactions={transactions}
        otherAccounts={(accounts ?? []).filter((a) => a.id !== invoiceFor?.id)}
      />
    </div>
  )
}
