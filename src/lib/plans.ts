import type { Profile } from '../types/database'
import { computeAccess } from './access'

export type PlanId = 'start' | 'plus' | 'pro_plan' | 'premium'

export type FeatureKey = 'import_invoice' | 'loans' | 'pdf' | 'csv' | 'schedules' | 'planning' | 'assistant'

export interface PlanInfo {
  id: PlanId
  name: string
  /** mensalidade, a partir da 2ª cobrança */
  priceCents: number
  /** valor promocional da primeira cobrança na Kiwify */
  firstChargeCents: number
  /** lançamentos por mês (parcelamento/recorrência conta como 1); null = sem limite */
  monthlyLimit: number | null
  tagline: string
  features: string[]
  /** recursos anunciados como "em breve" (ainda não existem no app) */
  soon?: string[]
  /** plano que mais vale a pena (destaque na página de vendas) */
  bestValue?: boolean
  /** link de pagamento da Kiwify (vem de VITE_KIWIFY_URL_<PLANO>); vazio = ainda não configurado */
  checkoutUrl: string
}

const env = import.meta.env

export const PLANS: PlanInfo[] = [
  {
    id: 'start',
    name: 'Start',
    priceCents: 1990,
    firstChargeCents: 990,
    monthlyLimit: 25,
    tagline: 'Para começar a organizar',
    features: [
      'Até 25 lançamentos por mês',
      'Contas, cartões e faturas',
      'Metas e reservas',
      'Relatórios do mês',
      'Avisos de vencimento',
      'Histórico de 6 meses',
    ],
    checkoutUrl: env.VITE_KIWIFY_URL_START ?? '',
  },
  {
    id: 'plus',
    name: 'Plus',
    priceCents: 2990,
    firstChargeCents: 1990,
    monthlyLimit: 50,
    tagline: 'Para quem usa todo dia',
    features: ['Até 50 lançamentos por mês', 'Tudo do Start', 'Importar fatura do cartão', 'Controle de empréstimos'],
    checkoutUrl: env.VITE_KIWIFY_URL_PLUS ?? '',
  },
  {
    id: 'pro_plan',
    name: 'Pro',
    priceCents: 3990,
    firstChargeCents: 2990,
    monthlyLimit: 70,
    tagline: 'Para planejar o próximo mês, não só registrar',
    features: [
      'Até 70 lançamentos por mês',
      'Tudo do Plus',
      'Orçamento por categoria, com alertas',
      'Previsão do saldo até o fim do mês',
      'Exportar para Excel (CSV) e PDF',
      'Lembretes programados',
      'Histórico de 24 meses',
    ],
    bestValue: true,
    checkoutUrl: env.VITE_KIWIFY_URL_PRO ?? '',
  },
  {
    id: 'premium',
    name: 'Premium',
    priceCents: 5990,
    firstChargeCents: 3990,
    monthlyLimit: null,
    tagline: 'Sem limite e com tudo guardado para sempre',
    features: [
      'Lançamentos sem limite',
      'Tudo do Pro',
      'Assistente financeira com o nome que você escolher',
      'Histórico ilimitado: nada é apagado',
    ],
    checkoutUrl: env.VITE_KIWIFY_URL_PREMIUM ?? '',
  },
]

/** Custo médio por lançamento (centavos) na mensalidade cheia; null se o plano não tem limite. */
export function centsPerEntry(plan: PlanInfo): number | null {
  return plan.monthlyLimit ? Math.round(plan.priceCents / plan.monthlyLimit) : null
}

export const MIN_PRICE_CENTS = PLANS[0].priceCents

const TIER: Record<PlanId, number> = { start: 1, plus: 2, pro_plan: 3, premium: 4 }

/** A partir de qual plano cada recurso fica liberado. */
const FEATURE_MIN_PLAN: Record<FeatureKey, PlanId> = {
  import_invoice: 'plus',
  loans: 'plus',
  pdf: 'pro_plan',
  csv: 'pro_plan',
  planning: 'pro_plan',
  schedules: 'pro_plan',
  assistant: 'premium',
}

/**
 * Link de pagamento da Kiwify do plano. Leva o e-mail da conta (pré-preenche) e o id do usuário em `s1`: a Kiwify devolve
 * esse valor no aviso da compra, e o servidor libera o plano na conta que abriu o pagamento, sem depender do e-mail digitado.
 * Vazio = sem link configurado.
 */
export function checkoutHref(url: string, email?: string | null, userId?: string | null): string {
  if (!url) return ''
  if (!email && !userId) return url
  try {
    const u = new URL(url)
    if (email) u.searchParams.set('email', email)
    if (userId) u.searchParams.set('s1', userId)
    return u.toString()
  } catch {
    return url
  }
}

export function planById(id: string | null | undefined): PlanInfo | null {
  return PLANS.find((p) => p.id === id) ?? null
}

/**
 * Plano que vale para o usuário agora. 'all' = tudo liberado e sem limite (admin, vitalício
 * e quem assina o plano antigo de R$ 12,90). null = sem acesso.
 */
export function effectivePlan(profile: Profile | null): PlanId | 'all' | null {
  const access = computeAccess(profile)
  if (!access || access.kind === 'expired' || access.kind === 'blocked') return null
  if (access.kind === 'active') return planById(profile?.plan_id)?.id ?? 'all'
  return 'all'
}

/**
 * Só controla o que aparece na tela. O limite de lançamentos é aplicado de verdade no banco
 * (sql/022); os recursos abaixo são liberados/bloqueados aqui por plano.
 */
export function canUseFeature(profile: Profile | null, feature: FeatureKey): boolean {
  const plan = effectivePlan(profile)
  if (plan === 'all') return true
  if (!plan) return false
  return TIER[plan] >= TIER[FEATURE_MIN_PLAN[feature]]
}

export function featureMinPlan(feature: FeatureKey): PlanInfo {
  return planById(FEATURE_MIN_PLAN[feature])!
}
