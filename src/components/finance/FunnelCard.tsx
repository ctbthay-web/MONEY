import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Funnel } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { supabase } from '../../lib/supabase'

interface FunnelRow {
  name: string
  events: number
  visitors: number
}
interface ErrorRow {
  created_at: string
  name: string
  path: string | null
  plan_id: string | null
  meta: { message?: string; source?: string; line?: number } | null
}

// ordem do caminho de venda; cada etapa mostra quantos visitantes chegaram e quanto isso é da etapa anterior
const STEPS: { name: string; label: string }[] = [
  { name: 'landing_view', label: 'Viram a página de vendas' },
  { name: 'plan_click', label: 'Clicaram em um plano' },
  { name: 'register_view', label: 'Abriram o cadastro' },
  { name: 'signup_done', label: 'Criaram a conta' },
  { name: 'checkout_redirect', label: 'Foram ao pagamento' },
]

/** Funil de vendas e erros recentes do app (só admin; vem das funções admin_funnel / admin_recent_errors, sql/030). */
export function FunnelCard() {
  const [days, setDays] = useState(30)
  const funnel = useQuery({
    queryKey: ['admin-funnel', days],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_funnel', { p_days: days })
      if (error) throw new Error(error.message)
      return (data ?? []) as FunnelRow[]
    },
  })
  const errors = useQuery({
    queryKey: ['admin-errors'],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_recent_errors', { p_limit: 15 })
      if (error) throw new Error(error.message)
      return (data ?? []) as ErrorRow[]
    },
  })

  const byName = new Map((funnel.data ?? []).map((r) => [r.name, r]))
  const existing = byName.get('signup_existing')

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <Funnel className="h-4 w-4 text-brand-300" /> Funil de vendas
        </h2>
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${days === d ? 'bg-brand-gradient text-[#04241C]' : 'text-ink-secondary'}`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {funnel.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : funnel.isError ? (
        <p className="text-sm text-ink-secondary">A medição ainda não está ativa neste banco (falta aplicar o sql/030).</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {STEPS.map((s, i) => {
              const row = byName.get(s.name)
              const prev = i > 0 ? byName.get(STEPS[i - 1].name) : undefined
              const pct = prev && prev.visitors > 0 && row ? Math.round((row.visitors / prev.visitors) * 100) : null
              return (
                <li key={s.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm">
                  <span className="text-ink-secondary">{s.label}</span>
                  <span className="flex items-center gap-3">
                    {pct !== null && <span className="text-xs text-ink-muted">{pct}% da etapa anterior</span>}
                    <span className="font-display font-bold text-ink-primary">{row?.visitors ?? 0}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Números de visitantes únicos no período (por navegador). O pagamento confirmado aparece em Usuários, quando o plano é liberado.
            {existing ? ` ${existing.visitors} tentaram se cadastrar com um e-mail que já tinha conta.` : ''}
          </p>
        </>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Erros recentes</h3>
      {errors.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : errors.isError ? null : (errors.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-secondary">Nenhum erro registrado. 🎉</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {(errors.data ?? []).map((e, i) => (
            <li key={i} className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
              <p className="text-ink-primary">{e.meta?.message ?? e.name}</p>
              <p className="text-ink-muted">
                {new Date(e.created_at).toLocaleString('pt-BR')} · {e.path ?? '—'}
                {e.meta?.source ? ` · ${e.meta.source.split('/').pop()}:${e.meta.line ?? ''}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
