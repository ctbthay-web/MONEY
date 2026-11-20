// Plano que a pessoa escolheu na página de vendas antes de criar a conta. Guardado só neste navegador
// (localStorage) para sobreviver ao e-mail de confirmação; serve apenas para levar direto ao pagamento certo.
import { planById, type PlanInfo } from './plans'

const KEY = 'money.pendingPlan'

/** Plano válido vindo de um texto (ex.: ?plan=pro_plan); null se não for um dos planos à venda. */
export function parsePlanParam(value: string | null | undefined): PlanInfo | null {
  return planById(value ?? null)
}

export function setPendingPlan(planId: string) {
  try {
    localStorage.setItem(KEY, planId)
  } catch {
    /* sem armazenamento: o plano só não é lembrado depois do e-mail de confirmação */
  }
}

export function getPendingPlan(): PlanInfo | null {
  try {
    return planById(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

/** Plano vindo do endereço (?plan=...): o link do e-mail de confirmação volta ao app com ele, mesmo em outro aparelho. */
export function planFromUrl(search: string): PlanInfo | null {
  try {
    return planById(new URLSearchParams(search).get('plan'))
  } catch {
    return null
  }
}

// Evita laço: o redirecionamento automático ao pagamento acontece uma vez por aba. Se a pessoa voltar da Kiwify sem pagar,
// vê a escolha de planos normalmente (com o botão do plano escolhido) em vez de ser levada de novo.
const AUTO_KEY = 'money.autoPay'

export function autoPayAlreadyDone(planId: string): boolean {
  try {
    return sessionStorage.getItem(AUTO_KEY) === planId
  } catch {
    return false
  }
}

export function markAutoPay(planId: string) {
  try {
    sessionStorage.setItem(AUTO_KEY, planId)
  } catch {
    /* ignora */
  }
}

export function clearPendingPlan() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}
