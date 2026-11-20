import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Receipt, CalendarCheck, Undo2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { CurrencyInput } from '../ui/CurrencyInput'
import { useAccounts } from '../../lib/queries/useAccounts'
import { useCategories } from '../../lib/queries/useCategories'
import { useTransactionMutations, type RepeatMode, type TransactionInput } from '../../lib/queries/useTransactions'
import { useRecurrenceMutations } from '../../lib/queries/useRecurrences'
import { MODE_HELP, MODE_LABEL } from '../../lib/recurrence'
import { useToast } from '../ui/Toast'
import { todayISO, formatCentsToBRL, formatDate } from '../../lib/format'
import { ACCOUNT_TYPE_LABELS } from '../../lib/accountTypes'
import { getInvoiceDueDate, getInvoicePeriod, invoicePeriodLabel } from '../../lib/invoices'
import type { RecurrenceFrequency, RecurrenceMode, TransactionWithRelations, TxType } from '../../types/database'

const schema = z.object({
  type: z.enum(['income', 'expense']),
  description: z.string().min(1, 'Informe uma descrição').max(120),
  amountCents: z.number().refine((v) => v > 0, 'Informe um valor maior que zero'),
  account_id: z.string().min(1, 'Selecione uma conta'),
  category_id: z.string().min(1, 'Selecione uma categoria'),
  date: z.string().min(1, 'Selecione a data'),
  dueDate: z.string().optional(),
  note: z.string().max(280).optional(),
  repeatMode: z.enum(['none', 'recurring', 'installment']),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  occurrences: z.number(),
  recurrenceKind: z.enum(['fixed', 'variable', 'per_occurrence']),
})
type FormValues = z.infer<typeof schema>

const frequencyLabels: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
}

const RECURRING_OCCURRENCE_OPTIONS = [3, 6, 12, 24]
const INSTALLMENT_OPTIONS = Array.from({ length: 23 }, (_, i) => i + 2) // 2..24

export function TransactionForm({
  open,
  onClose,
  editing,
  defaultType = 'expense',
  onRequestDelete,
}: {
  open: boolean
  onClose: () => void
  editing?: TransactionWithRelations | null
  defaultType?: TxType
  onRequestDelete?: (transaction: TransactionWithRelations) => void
}) {
  const { data: accounts = [] } = useAccounts()
  const [type, setType] = useState<TxType>(editing?.type ?? defaultType)
  const { data: categories = [] } = useCategories(type)
  const { create, update, confirm, unconfirm } = useTransactionMutations()
  const { createRecurring, updateSeriesFrom } = useRecurrenceMutations()
  // ao editar uma ocorrência de uma série (valor fixo): só esta (padrão) ou esta e as próximas ainda não confirmadas
  const [editScope, setEditScope] = useState<'one' | 'following'>('one')
  const toast = useToast()

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: editing?.type ?? defaultType,
      description: editing?.description ?? '',
      amountCents: editing?.amount_cents ?? 0,
      account_id: editing?.account_id ?? accounts[0]?.id ?? '',
      category_id: editing?.category_id ?? '',
      date: editing?.date ?? todayISO(),
      dueDate: editing?.due_date ?? '',
      note: editing?.note ?? '',
      repeatMode: 'none',
      frequency: 'monthly',
      occurrences: 12,
      recurrenceKind: 'fixed',
    },
  })

  const watchedType = watch('type')
  const repeatMode = watch('repeatMode')
  const recurrenceKind = watch('recurrenceKind')
  const amountCents = watch('amountCents')
  const occurrences = watch('occurrences')
  const watchedAccountId = watch('account_id')
  const watchedDate = watch('date')

  const selectedAccount = accounts.find((a) => a.id === watchedAccountId)
  const invoiceHint =
    watchedType === 'expense' && selectedAccount?.type === 'credit_card' && selectedAccount.closing_day && watchedDate
      ? (() => {
          const period = getInvoicePeriod(watchedDate, selectedAccount.closing_day!)
          const due = selectedAccount.due_day
            ? getInvoiceDueDate(period, selectedAccount.closing_day!, selectedAccount.due_day)
            : null
          return `Cai na fatura de ${invoicePeriodLabel(period)}${due ? `, vence em ${formatDate(due)}` : ''}.`
        })()
      : null

  useEffect(() => {
    setType(watchedType)
    if (watchedType !== editing?.type) setValue('category_id', '')
  }, [watchedType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      reset({
        type: editing?.type ?? defaultType,
        description: editing?.description ?? '',
        amountCents: editing?.amount_cents ?? 0,
        account_id: editing?.account_id ?? accounts[0]?.id ?? '',
        category_id: editing?.category_id ?? '',
        date: editing?.date ?? todayISO(),
        dueDate: editing?.due_date ?? '',
        note: editing?.note ?? '',
        repeatMode: 'none',
        frequency: 'monthly',
        occurrences: 12,
        recurrenceKind: 'fixed',
      })
      setEditScope('one')
      setType(editing?.type ?? defaultType)
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setValue('occurrences', repeatMode === 'installment' ? 2 : 12)
  }, [repeatMode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: FormValues) {
    const input: TransactionInput = {
      type: values.type,
      description: values.description,
      amount_cents: values.amountCents,
      account_id: values.account_id,
      category_id: values.category_id || null,
      date: values.date,
      due_date: values.dueDate || null,
      note: values.note?.trim() ? values.note.trim() : null,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input })
        let extra = ''
        if (editScope === 'following' && editing.series_id && editing.recurrence_frequency) {
          // só as próximas ainda não confirmadas; as anteriores e esta (já salva acima) não são tocadas de novo
          const n = await updateSeriesFrom.mutateAsync({
            seriesId: editing.series_id,
            fromDate: editing.date,
            patch: {
              amount_cents: input.amount_cents,
              description: input.description,
              category_id: input.category_id,
              account_id: input.account_id,
              note: input.note,
            },
          })
          extra = n > 0 ? ` ${n} próxima(s) ocorrência(s) também atualizada(s).` : ''
        }
        toast.success(`Movimentação atualizada.${extra}`)
      } else if (values.repeatMode === 'recurring') {
        const kind: RecurrenceMode = values.recurrenceKind
        const count = await createRecurring.mutateAsync({
          input,
          mode: kind,
          frequency: values.frequency,
          occurrences: values.occurrences,
        })
        toast.success(
          kind === 'fixed'
            ? `${count} movimentações criadas.`
            : 'Movimentação criada. As próximas aparecem como previsão em Movimentações.'
        )
      } else {
        const selectedRepeatMode: RepeatMode = values.repeatMode
        await create.mutateAsync({
          input,
          repeat:
            selectedRepeatMode === 'none'
              ? { mode: 'none' }
              : { mode: selectedRepeatMode, frequency: values.frequency, occurrences: values.occurrences },
        })
        toast.success(
          selectedRepeatMode === 'none' ? 'Movimentação criada.' : `${values.occurrences} movimentações criadas.`
        )
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar movimentação.')
    }
  }

  const noAccounts = accounts.length === 0
  const perInstallmentCents =
    repeatMode === 'installment' && occurrences > 0 ? Math.floor(amountCents / occurrences) : 0
  const isCreditCard = selectedAccount?.type === 'credit_card'
  // Compra no cartão não tem confirmação por item — quem "quita" é a fatura inteira (ver InvoiceModal).
  const isPending = Boolean(editing && !editing.applied_to_balance) && !isCreditCard
  const isConfirmed = Boolean(editing && editing.applied_to_balance) && !isCreditCard

  async function confirmNow() {
    if (!editing) return
    try {
      await confirm.mutateAsync({ id: editing.id, date: watchedDate > todayISO() ? todayISO() : undefined })
      toast.success(editing.type === 'income' ? 'Recebimento confirmado — movido para Relatórios.' : 'Pagamento confirmado — movido para Relatórios.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao confirmar.')
    }
  }

  async function undoNow() {
    if (!editing) return
    try {
      await unconfirm.mutateAsync(editing.id)
      toast.success('Confirmação desfeita — voltou para Movimentações.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desfazer.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar movimentação' : 'Nova movimentação'}>
      {noAccounts ? (
        <p className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          Crie uma conta antes de registrar movimentações.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
            {(['expense', 'income'] as TxType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setValue('type', t)}
                className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
                  watchedType === t ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary'
                }`}
              >
                {t === 'income' ? 'Receita' : 'Despesa'}
              </button>
            ))}
          </div>

          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <CurrencyInput
                label={
                  repeatMode === 'installment'
                    ? 'Valor total da compra'
                    : repeatMode === 'recurring' && recurrenceKind !== 'fixed'
                      ? 'Valor desta ocorrência'
                      : 'Valor'
                }
                valueCents={field.value}
                onValueChange={field.onChange}
                error={errors.amountCents?.message}
              />
            )}
          />
          {repeatMode === 'installment' && occurrences > 0 && (
            <p className="-mt-2 text-xs text-ink-secondary">
              {occurrences}x de {formatCentsToBRL(perInstallmentCents)}
            </p>
          )}

          <Input label="Descrição" placeholder="Ex: Supermercado" error={errors.description?.message} {...register('description')} />

          <Select label="Categoria" error={errors.category_id?.message} {...register('category_id')}>
            <option value="">Selecione</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select label="Conta" error={errors.account_id?.message} {...register('account_id')}>
            <option value="">Selecione</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </Select>

          {isCreditCard ? (
            <Input label="Data da compra" type="date" error={errors.date?.message} {...register('date')} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Data" type="date" error={errors.date?.message} {...register('date')} />
              <Input label="Vencimento (opcional)" type="date" {...register('dueDate')} />
            </div>
          )}
          {isPending && (
            <button
              type="button"
              onClick={confirmNow}
              disabled={isSubmitting || confirm.isPending}
              className="-mt-2 flex items-center gap-1.5 self-start text-xs font-semibold text-brand-300 hover:text-brand-200"
            >
              <CalendarCheck className="h-3.5 w-3.5" />
              {watchedType === 'income' ? 'Já recebi — confirmar recebimento' : 'Já paguei — confirmar pagamento'}
            </button>
          )}
          {isConfirmed && (
            <button
              type="button"
              onClick={undoNow}
              disabled={isSubmitting || unconfirm.isPending}
              className="-mt-2 flex items-center gap-1.5 self-start text-xs font-semibold text-ink-secondary hover:text-ink-primary"
            >
              <Undo2 className="h-3.5 w-3.5" /> Desfazer confirmação (voltar para pendente)
            </button>
          )}
          {invoiceHint && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-brand-300">
              <Receipt className="h-3.5 w-3.5" /> {invoiceHint}
            </p>
          )}

          <Input label="Observação (opcional)" placeholder="Detalhes adicionais" {...register('note')} />

          {editing && editing.series_id && editing.recurrence_frequency && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
              <span className="text-sm font-medium text-ink-secondary">Esta é uma ocorrência recorrente. Aplicar a:</span>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
                {([
                  { v: 'one', label: 'Só esta' },
                  { v: 'following', label: 'Esta e as próximas' },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setEditScope(o.v)}
                    className={`rounded-xl py-2 text-xs font-semibold transition-colors ${
                      editScope === o.v ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted">
                {editScope === 'one'
                  ? 'Só esta ocorrência muda; a recorrência e as demais ficam como estão.'
                  : 'Valor, descrição, categoria e conta passam a valer para as próximas ocorrências ainda não confirmadas. As anteriores não mudam.'}
              </p>
            </div>
          )}
          {editing && editing.recurrence_id && (
            <p className="text-xs text-ink-muted">Ocorrência de uma recorrência de valor variável: alterar este valor não muda as anteriores nem a previsão base.</p>
          )}

          {!editing && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
              <span className="text-sm font-medium text-ink-secondary">Repetição</span>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/5 p-1">
                {(
                  [
                    { value: 'none', label: 'Não repete' },
                    { value: 'recurring', label: 'Recorrente' },
                    { value: 'installment', label: 'Parcelado' },
                  ] as { value: RepeatMode; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setValue('repeatMode', opt.value)}
                    className={`rounded-xl py-2 text-xs font-semibold transition-colors ${
                      repeatMode === opt.value ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {repeatMode === 'recurring' && (
                <>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white/5 p-1">
                    {(['fixed', 'variable', 'per_occurrence'] as RecurrenceMode[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setValue('recurrenceKind', k)}
                        className={`rounded-xl px-1 py-2 text-[11px] font-semibold leading-tight transition-colors ${
                          recurrenceKind === k ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary'
                        }`}
                      >
                        {MODE_LABEL[k]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-ink-secondary">{MODE_HELP[recurrenceKind]}</p>
                  <div className={recurrenceKind === 'fixed' ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
                    <Select label="Frequência" {...register('frequency')}>
                      {(Object.keys(frequencyLabels) as RecurrenceFrequency[]).map((f) => (
                        <option key={f} value={f}>
                          {frequencyLabels[f]}
                        </option>
                      ))}
                    </Select>
                    {recurrenceKind === 'fixed' && (
                      <Select label="Repetir por" {...register('occurrences', { valueAsNumber: true })}>
                        {RECURRING_OCCURRENCE_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </>
              )}

              {repeatMode === 'installment' && (
                <Select label="Número de parcelas" {...register('occurrences', { valueAsNumber: true })}>
                  {INSTALLMENT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
            {editing ? 'Salvar alterações' : 'Adicionar movimentação'}
          </Button>

          {editing && onRequestDelete && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-danger hover:bg-danger-soft"
              onClick={() => onRequestDelete(editing)}
            >
              Excluir movimentação
            </Button>
          )}
        </form>
      )}
    </Modal>
  )
}
