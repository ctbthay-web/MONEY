import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { CurrencyInput } from '../ui/CurrencyInput'
import { useTransferMutations } from '../../lib/queries/useTransfers'
import { useToast } from '../ui/Toast'
import { todayISO } from '../../lib/format'
import { ACCOUNT_TYPE_LABELS } from '../../lib/accountTypes'
import type { Account } from '../../types/database'

const schema = z
  .object({
    from_account_id: z.string().min(1, 'Selecione a conta de origem'),
    to_account_id: z.string().min(1, 'Selecione a conta de destino'),
    amountCents: z.number().refine((v) => v > 0, 'Informe um valor maior que zero'),
    date: z.string().min(1, 'Selecione a data'),
    description: z.string().max(120).optional(),
  })
  .refine((d) => d.from_account_id !== d.to_account_id, {
    message: 'As contas de origem e destino devem ser diferentes',
    path: ['to_account_id'],
  })
type FormValues = z.infer<typeof schema>

export function TransferModal({
  open,
  onClose,
  accounts,
}: {
  open: boolean
  onClose: () => void
  accounts: Account[]
}) {
  const { create } = useTransferMutations()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { from_account_id: '', to_account_id: '', amountCents: 0, date: todayISO(), description: '' },
  })

  useEffect(() => {
    if (open) reset({ from_account_id: '', to_account_id: '', amountCents: 0, date: todayISO(), description: '' })
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    try {
      await create.mutateAsync({
        from_account_id: values.from_account_id,
        to_account_id: values.to_account_id,
        amount_cents: values.amountCents,
        date: values.date,
        description: values.description?.trim() ? values.description.trim() : null,
      })
      toast.success('Transferência registrada.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar transferência.')
    }
  }

  const noAccounts = accounts.length < 2

  return (
    <Modal open={open} onClose={onClose} title="Transferir entre contas">
      {noAccounts ? (
        <p className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          Você precisa de pelo menos duas contas cadastradas para transferir.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <CurrencyInput label="Valor" valueCents={field.value} onValueChange={field.onChange} error={errors.amountCents?.message} />
            )}
          />
          <Select label="Conta de origem" error={errors.from_account_id?.message} {...register('from_account_id')}>
            <option value="">Selecione</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </Select>
          <Select label="Conta de destino" error={errors.to_account_id?.message} {...register('to_account_id')}>
            <option value="">Selecione</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
              </option>
            ))}
          </Select>
          <Input label="Data" type="date" error={errors.date?.message} {...register('date')} />
          <Input label="Descrição (opcional)" placeholder="Ex: Pagamento da fatura" {...register('description')} />
          <p className="text-xs text-ink-muted">
            Transferências não contam como receita nem despesa nos relatórios — só movem o saldo entre as contas.
          </p>
          <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
            Transferir
          </Button>
        </form>
      )}
    </Modal>
  )
}
