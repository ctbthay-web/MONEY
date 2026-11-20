import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Tags, Lock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { IconPicker, ColorPicker } from '../components/ui/IconColorPicker'
import { useCategories, useCategoryMutations, type CategoryInput } from '../lib/queries/useCategories'
import { useAuth } from '../features/auth/AuthProvider'
import { useToast } from '../components/ui/Toast'
import { resolveIcon } from '../lib/icons'
import type { Category, TxType } from '../types/database'

const schema = z.object({
  name: z.string().min(1, 'Informe um nome').max(60),
  type: z.enum(['income', 'expense']),
  color: z.string(),
  icon: z.string(),
})
type FormValues = z.infer<typeof schema>

export function CategoriesPage() {
  const { data: categories, isLoading, isError, refetch } = useCategories()
  const { create, update, remove } = useCategoryMutations()
  const { isAdmin } = useAuth()
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'expense', color: '#2DD4BF', icon: 'tag' },
  })

  function openCreate(type: TxType) {
    setEditing(null)
    reset({ name: '', type, color: '#2DD4BF', icon: 'tag' })
    setFormOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    reset({ name: cat.name, type: cat.type, color: cat.color, icon: cat.icon })
    setFormOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const input: CategoryInput = values
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input })
        toast.success('Categoria atualizada.')
      } else {
        await create.mutateAsync(input)
        toast.success('Categoria criada.')
      }
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar categoria.')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Categoria excluída.')
      setDeleting(null)
    } catch {
      toast.error('Não foi possível excluir. Ela pode estar em uso por movimentações.')
    }
  }

  function canManage(cat: Category) {
    return cat.user_id !== null || isAdmin
  }

  const income = categories?.filter((c) => c.type === 'income') ?? []
  const expense = categories?.filter((c) => c.type === 'expense') ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Categorias</h1>
          {!isLoading && !isError && categories && (
            <p className="mt-1 text-sm text-ink-secondary">
              <span className="font-display text-base font-bold text-ink-primary">{categories.length}</span> no total
              · {income.length} receita{income.length === 1 ? '' : 's'} · {expense.length} despesa
              {expense.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          title="Não foi possível carregar as categorias"
          action={<Button onClick={() => refetch()}>Tentar novamente</Button>}
        />
      )}

      {!isLoading && !isError && (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-secondary">Receitas</h2>
              <Button size="sm" variant="secondary" onClick={() => openCreate('income')}>
                <Plus className="h-3.5 w-3.5" /> Nova
              </Button>
            </div>
            {income.length === 0 ? (
              <EmptyState icon={<Tags className="h-6 w-6" />} title="Nenhuma categoria de receita" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {income.map((c) => (
                  <CategoryRow key={c.id} category={c} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} canManage={canManage(c)} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-secondary">Despesas</h2>
              <Button size="sm" variant="secondary" onClick={() => openCreate('expense')}>
                <Plus className="h-3.5 w-3.5" /> Nova
              </Button>
            </div>
            {expense.length === 0 ? (
              <EmptyState icon={<Tags className="h-6 w-6" />} title="Nenhuma categoria de despesa" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {expense.map((c) => (
                  <CategoryRow key={c.id} category={c} onEdit={() => openEdit(c)} onDelete={() => setDeleting(c)} canManage={canManage(c)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar categoria' : 'Nova categoria'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input label="Nome" placeholder="Ex: Mercado" error={errors.name?.message} {...register('name')} />
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
            {editing ? 'Salvar alterações' : 'Criar categoria'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir categoria"
        description={`Tem certeza que deseja excluir "${deleting?.name}"? Movimentações que usam essa categoria ficarão sem categoria.`}
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

function CategoryRow({
  category,
  onEdit,
  onDelete,
  canManage,
}: {
  category: Category
  onEdit: () => void
  onDelete: () => void
  canManage: boolean
}) {
  const Icon = resolveIcon(category.icon)
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${category.color}22`, color: category.color }}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <span className="flex-1 truncate text-sm font-medium text-ink-primary">{category.name}</span>
      {canManage ? (
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded-full px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-white/5">
            Editar
          </button>
          <button onClick={onDelete} className="rounded-full px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft">
            Excluir
          </button>
        </div>
      ) : (
        <Lock className="h-3.5 w-3.5 text-ink-muted" aria-label="Categoria padrão" />
      )}
    </Card>
  )
}
