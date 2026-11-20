import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Target, Minus, PlusCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { CurrencyInput } from '../components/ui/CurrencyInput'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { IconPicker, ColorPicker } from '../components/ui/IconColorPicker'
import { GoalCard } from '../components/finance/GoalCard'
import { useGoals, useGoalMutations, useGoalContributions, type GoalInput } from '../lib/queries/useGoals'
import { useToast } from '../components/ui/Toast'
import { formatCentsToBRL, formatDate } from '../lib/format'
import type { Goal } from '../types/database'

const schema = z.object({
  name: z.string().min(1, 'Informe um nome').max(60),
  targetCents: z.number().refine((v) => v > 0, 'Informe um valor maior que zero'),
  deadline: z.string().optional(),
  color: z.string(),
  icon: z.string(),
})
type FormValues = z.infer<typeof schema>

export function ReservesPage() {
  const { data: goals, isLoading, isError, refetch } = useGoals()
  const { create, update, archive, remove, contribute } = useGoalMutations()
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [archiving, setArchiving] = useState<Goal | null>(null)
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null)
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null)
  const [contribMode, setContribMode] = useState<'deposit' | 'withdraw' | null>(null)
  const [contribAmount, setContribAmount] = useState(0)

  const { data: contributions = [] } = useGoalContributions(detailGoal?.id)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', targetCents: 0, deadline: '', color: '#2DD4BF', icon: 'target' },
  })

  function openCreate() {
    setEditing(null)
    reset({ name: '', targetCents: 0, deadline: '', color: '#2DD4BF', icon: 'target' })
    setFormOpen(true)
  }

  function openEdit(goal: Goal) {
    setDetailGoal(null)
    setEditing(goal)
    reset({
      name: goal.name,
      targetCents: goal.target_cents,
      deadline: goal.deadline ?? '',
      color: goal.color,
      icon: goal.icon,
    })
    setFormOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const input: GoalInput = {
      name: values.name,
      target_cents: values.targetCents,
      deadline: values.deadline || null,
      color: values.color,
      icon: values.icon,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input })
        toast.success('Meta atualizada.')
      } else {
        await create.mutateAsync(input)
        toast.success('Meta criada.')
      }
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar meta.')
    }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await archive.mutateAsync(archiving.id)
      toast.success('Meta arquivada. O valor acumulado foi preservado.')
      setArchiving(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao arquivar meta.')
    }
  }

  async function confirmDeleteGoal() {
    if (!deletingGoal) return
    try {
      await remove.mutateAsync(deletingGoal.id)
      toast.success('Meta excluída.')
      setDeletingGoal(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir meta.')
    }
  }

  async function submitContribution() {
    if (!detailGoal || !contribMode || contribAmount <= 0) return
    if (contribMode === 'withdraw' && contribAmount > detailGoal.accumulated_cents) {
      toast.error('O valor de resgate não pode ser maior que o valor acumulado.')
      return
    }
    const amount = contribMode === 'deposit' ? contribAmount : -contribAmount
    try {
      await contribute.mutateAsync({ goalId: detailGoal.id, amountCents: amount })
      toast.success(contribMode === 'deposit' ? 'Aporte registrado.' : 'Resgate registrado.')
      setContribMode(null)
      setContribAmount(0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Reservas e metas</h1>
          {!isLoading && !isError && goals && goals.length > 0 && (
            <p className="mt-1 text-sm text-ink-secondary">
              <span className="font-display text-base font-bold text-positive">
                {formatCentsToBRL(goals.reduce((sum, g) => sum + g.accumulated_cents, 0))}
              </span>{' '}
              acumulado em {goals.length} {goals.length === 1 ? 'meta' : 'metas'}
            </p>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nova meta
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState title="Não foi possível carregar as metas" action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />
      )}

      {!isLoading && !isError && goals && goals.length === 0 && (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="Nenhuma meta criada"
          description="Defina uma meta financeira e acompanhe seu progresso ao longo do tempo."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Criar meta
            </Button>
          }
        />
      )}

      {!isLoading && !isError && goals && goals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onClick={() => setDetailGoal(g)} onOptions={() => setDetailGoal(g)} />
          ))}
        </div>
      )}

      <Modal open={Boolean(detailGoal)} onClose={() => setDetailGoal(null)} title={detailGoal?.name ?? ''}>
        {detailGoal && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setContribMode('deposit')}>
                <PlusCircle className="h-4 w-4" /> Aportar
              </Button>
              <Button variant="secondary" onClick={() => setContribMode('withdraw')}>
                <Minus className="h-4 w-4" /> Resgatar
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
              <button onClick={() => openEdit(detailGoal)} className="font-medium text-brand-300 hover:text-brand-200">
                Editar meta
              </button>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setArchiving(detailGoal)
                    setDetailGoal(null)
                  }}
                  className="font-medium text-ink-secondary hover:text-ink-primary"
                >
                  Arquivar meta
                </button>
                <button
                  onClick={() => {
                    setDeletingGoal(detailGoal)
                    setDetailGoal(null)
                  }}
                  className="font-medium text-danger hover:text-danger/80"
                >
                  Excluir meta
                </button>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Histórico</h4>
              {contributions.length === 0 ? (
                <p className="text-sm text-ink-secondary">Nenhum aporte registrado ainda.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                  {contributions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm">
                      <span className="text-ink-secondary">{formatDate(c.date)}</span>
                      <span className={c.amount_cents >= 0 ? 'font-semibold text-positive' : 'font-semibold text-danger'}>
                        {c.amount_cents >= 0 ? '+' : ''}
                        {formatCentsToBRL(c.amount_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(contribMode)}
        onClose={() => setContribMode(null)}
        title={contribMode === 'deposit' ? 'Registrar aporte' : 'Registrar resgate'}
      >
        <div className="flex flex-col gap-4">
          <CurrencyInput label="Valor" valueCents={contribAmount} onValueChange={setContribAmount} />
          <Button onClick={submitContribution} loading={contribute.isPending} size="lg" disabled={contribAmount <= 0}>
            Confirmar
          </Button>
        </div>
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar meta' : 'Nova meta'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input label="Nome" placeholder="Ex: Viagem, Reserva de emergência" error={errors.name?.message} {...register('name')} />
          <Controller
            control={control}
            name="targetCents"
            render={({ field }) => (
              <CurrencyInput label="Valor da meta" valueCents={field.value} onValueChange={field.onChange} error={errors.targetCents?.message} />
            )}
          />
          <Input label="Prazo (opcional)" type="date" {...register('deadline')} />
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
            {editing ? 'Salvar alterações' : 'Criar meta'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar meta"
        description={`"${archiving?.name}" será arquivada. O valor acumulado permanece preservado.`}
        confirmLabel="Arquivar"
        loading={archive.isPending}
        onConfirm={confirmArchive}
        onClose={() => setArchiving(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingGoal)}
        title="Excluir meta"
        description={`Excluir "${deletingGoal?.name}"? Isso apaga a meta e todo o histórico de aportes/resgates permanentemente. Diferente de arquivar, não pode ser desfeito.`}
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={confirmDeleteGoal}
        onClose={() => setDeletingGoal(null)}
      />
    </div>
  )
}
