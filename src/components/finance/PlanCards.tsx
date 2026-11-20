import { Link } from 'react-router-dom'
import { Check, Clock } from 'lucide-react'
import { PLANS, centsPerEntry, checkoutHref, type PlanId } from '../../lib/plans'
import { formatCentsToBRL } from '../../lib/format'
import { track } from '../../lib/track'

interface Props {
  /** landing: botões levam ao cadastro (criar conta e assinar). app: botões levam ao pagamento na Kiwify. */
  mode: 'landing' | 'app'
  currentPlanId?: PlanId | null
  /** e-mail da conta, enviado ao checkout para o plano cair na conta certa */
  email?: string | null
  /** id do usuário, enviado ao checkout (s1) para a compra ser ligada à conta que abriu o pagamento */
  userId?: string | null
}

export function PlanCards({ mode, currentPlanId = null, email, userId }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {PLANS.map((plan) => {
        const current = currentPlanId === plan.id
        const href = checkoutHref(plan.checkoutUrl, email, userId)
        const btn =
          'mt-6 inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold transition'
        const primary = `${btn} bg-brand-gradient text-[#04241C] hover:brightness-110`
        const secondary = `${btn} glass text-ink-primary hover:bg-white/[0.08]`
        const disabled = `${btn} cursor-not-allowed bg-white/5 text-ink-muted`

        const perEntry = centsPerEntry(plan)
        const best = Boolean(plan.bestValue)

        return (
          <div
            key={plan.id}
            className={`glass relative flex flex-col rounded-[1.75rem] p-6 ${best ? 'glow-ring xl:-mt-3 xl:pb-9' : ''}`}
          >
            {best && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-gradient px-3 py-1 text-xs font-bold text-[#04241C]">
                ★ Melhor custo-benefício
              </span>
            )}
            <p className="text-sm font-semibold text-brand-300">{plan.name}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Primeira cobrança</p>
            <p className="font-display text-4xl font-bold">{formatCentsToBRL(plan.firstChargeCents)}</p>
            <p className="mt-1 text-sm text-ink-secondary">
              depois <span className="font-semibold text-ink-primary">{formatCentsToBRL(plan.priceCents)}</span>/mês
            </p>
            {perEntry !== null && (
              <p className="mt-1 text-xs text-ink-muted">≈ {formatCentsToBRL(perEntry)} por lançamento</p>
            )}
            <p className="mt-3 text-sm text-ink-secondary">{plan.tagline}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {plan.features.map((f, i) => (
                <li key={f} className={`flex items-start gap-2.5 text-sm ${i === 0 ? 'font-semibold' : ''}`}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                  {f}
                </li>
              ))}
              {plan.soon?.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                  <span>
                    {f} <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase">em breve</span>
                  </span>
                </li>
              ))}
            </ul>

            {mode === 'landing' ? (
              <Link to={`/register?plan=${plan.id}`} onClick={() => track('funnel', 'plan_click', { planId: plan.id })} className={best ? primary : secondary}>
                Assinar {plan.name}
              </Link>
            ) : current ? (
              <span className={`${btn} border border-brand-400/40 text-brand-300`}>Seu plano atual</span>
            ) : href ? (
              <a href={href} onClick={() => track('funnel', 'checkout_click', { planId: plan.id })} className={best ? primary : secondary}>
                {currentPlanId ? 'Mudar para este plano' : `Assinar ${plan.name}`}
              </a>
            ) : (
              <span className={disabled}>Pagamento em breve</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
