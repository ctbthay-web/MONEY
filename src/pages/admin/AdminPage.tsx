import { useState } from 'react'
import { Users, Wallet, Receipt, Trash2, ShieldCheck } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { StatCard } from '../../components/finance/StatCard'
import { FunnelCard } from '../../components/finance/FunnelCard'
import { useAdminUsers, useAdminStats, useAdminMutations } from '../../lib/queries/useAdmin'
import { useAuth } from '../../features/auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'

export function AdminPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats()
  const { data: users, isLoading: usersLoading } = useAdminUsers()
  const { setRole, runCleanup } = useAdminMutations()
  const { user: currentUser } = useAuth()
  const toast = useToast()
  const [cleanupOpen, setCleanupOpen] = useState(false)

  async function toggleRole(userId: string, currentRole: 'user' | 'admin') {
    if (userId === currentUser?.id) {
      toast.error('Você não pode alterar sua própria permissão.')
      return
    }
    try {
      await setRole.mutateAsync({ userId, role: currentRole === 'admin' ? 'user' : 'admin' })
      toast.success('Permissão atualizada.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar permissão.')
    }
  }

  async function confirmCleanup() {
    try {
      const deleted = await runCleanup.mutateAsync()
      toast.success(`Limpeza concluída. ${deleted ?? 0} movimentação(ões) fora do prazo de retenção do plano removida(s).`)
      setCleanupOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao executar limpeza.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-primary">Administração</h1>
          {!statsLoading && stats && (
            <p className="text-sm text-ink-secondary">
              <span className="font-display text-base font-bold text-brand-300">{stats.userCount}</span> usuário
              {stats.userCount === 1 ? '' : 's'} cadastrado{stats.userCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      {statsLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Usuários" value={String(stats?.userCount ?? 0)} icon={<Users className="h-5 w-5" />} tone="brand" />
          <StatCard label="Contas cadastradas" value={String(stats?.accountCount ?? 0)} icon={<Wallet className="h-5 w-5" />} tone="neutral" />
          <StatCard label="Movimentações" value={String(stats?.transactionCount ?? 0)} icon={<Receipt className="h-5 w-5" />} tone="neutral" />
        </div>
      )}

      <FunnelCard />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Retenção de dados</h2>
            <p className="text-xs text-ink-secondary">
              Remove movimentações quitadas fora do prazo do plano (6 meses; 24 no Pro; Premium e vitalícios nunca). Saldos, metas, categorias e usuários nunca são afetados.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setCleanupOpen(true)}>
            <Trash2 className="h-4 w-4" /> Executar limpeza
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-primary">Usuários</h2>
        {usersLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(users ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-white/[0.03]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{u.full_name || 'Sem nome'}</p>
                  <p className="truncate text-xs text-ink-muted">{u.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role === 'admin' ? 'Admin' : 'Usuário'}</Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={setRole.isPending}
                    onClick={() => toggleRole(u.id, u.role)}
                    disabled={u.id === currentUser?.id}
                  >
                    {u.role === 'admin' ? 'Tornar usuário' : 'Tornar admin'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={cleanupOpen}
        title="Executar limpeza de retenção"
        description="Isso removerá permanentemente movimentações quitadas fora do prazo de retenção de cada plano (6 meses; 24 no Pro; nunca no Premium e vitalícios). Saldos e metas são preservados. Deseja continuar?"
        confirmLabel="Executar"
        loading={runCleanup.isPending}
        onConfirm={confirmCleanup}
        onClose={() => setCleanupOpen(false)}
      />
    </div>
  )
}
