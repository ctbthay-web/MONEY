import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Lock, LogOut, Wallet } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { FullScreenLoader } from '../../components/ui/FullScreenLoader'
import { PlanCards } from '../../components/finance/PlanCards'
import { computeAccess } from '../../lib/access'
import { SupportLinks } from '../../components/ui/SupportLinks'
import { track } from '../../lib/track'
import { supabase } from '../../lib/supabase'
import { checkoutHref, planById } from '../../lib/plans'
import { autoPayAlreadyDone, clearPendingPlan, getPendingPlan, markAutoPay, planFromUrl, setPendingPlan } from '../../lib/pendingPlan'

/**
 * Só entra no app quem tem acesso (assinatura paga confirmada pela Kiwify, admin, vitalício ou conta
 * ainda em teste antiga). Quem não tem vê apenas a escolha de plano. É a barreira de TELA; a barreira
 * real de gravação continua no banco (trigger a00_paywall).
 */
export function AccessGate() {
  const { session, profile, refreshProfile, signOut } = useAuth()
  const access = computeAccess(profile)
  const blocked = access?.kind === 'expired' || access?.kind === 'blocked'

  // "Conferir pagamento": pergunta à Kiwify (via /api/billing-sync) se esta conta tem pagamento aprovado e aplica o plano.
  // Rede de segurança do webhook; não cobra nada e só libera quando a Kiwify confirma uma venda paga desta conta.
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const autoChecked = useRef(false)
  async function checkPayment(silent = false) {
    setSyncing(true)
    if (!silent) setSyncMsg(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/billing-sync', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
      const json = (await res.json().catch(() => ({}))) as { status?: string }
      if (json.status === 'applied' || json.status === 'already_applied') {
        await refreshProfile()
        if (!silent) setSyncMsg('Pagamento encontrado! Liberando seu acesso…')
      } else if (!silent) {
        setSyncMsg(
          json.status === 'not_found'
            ? 'Ainda não encontramos um pagamento aprovado para este e-mail. Se acabou de pagar, aguarde alguns minutos e confira de novo.'
            : json.status === 'plan_unknown'
              ? 'Encontramos o pagamento, mas não conseguimos identificar o plano. Fale com o suporte.'
              : json.status === 'expired'
                ? 'O pagamento encontrado já venceu. Renove escolhendo um plano abaixo.'
                : 'Não foi possível conferir agora. Tente de novo em instantes.'
        )
      }
    } catch {
      if (!silent) setSyncMsg('Não foi possível conferir agora. Tente de novo em instantes.')
    } finally {
      setSyncing(false)
    }
  }
  // uma conferência automática ao abrir a tela de planos (conta sem acesso); depois, só quando a pessoa clicar
  useEffect(() => {
    if (autoChecked.current || !blocked || access?.kind !== 'expired') return
    autoChecked.current = true
    void checkPayment(true)
  })

  // plano escolhido na página de vendas: vem no endereço (link do e-mail de confirmação) ou do que ficou guardado neste navegador
  const fromLink = planFromUrl(window.location.search)
  // sem link nem memória do navegador (outro aparelho/navegador): usa o plano que ficou gravado na própria conta no cadastro
  const accountPlan = planById(String(session?.user.user_metadata?.chosen_plan ?? ''))
  const pending = fromLink ?? getPendingPlan() ?? accountPlan
  const pendingHref = pending ? checkoutHref(pending.checkoutUrl, session?.user.email, session?.user.id) : ''
  // conta nova que acabou de confirmar o e-mail e ainda não pagou: vai direto à página de pagamento do plano escolhido.
  // Só quando a pessoa chega PELO LINK do e-mail (?plan= no endereço). Nas aberturas seguintes do app (aba nova, app instalado)
  // ela vê a escolha de plano, com o botão do plano em destaque, em vez de ser jogada na Kiwify toda vez.
  const autoPay = Boolean(blocked && access?.kind === 'expired' && !profile?.paid_until && fromLink && pendingHref && !autoPayAlreadyDone(fromLink.id))
  useEffect(() => {
    if (!autoPay || !pending) return
    setPendingPlan(pending.id)
    markAutoPay(pending.id)
    track('funnel', 'checkout_redirect', { planId: pending.id, meta: { via: 'email_confirm' } })
    window.location.assign(pendingHref)
  }, [autoPay, pending, pendingHref])

  // Enquanto está na tela de pagamento, confere sozinho se o pagamento já foi confirmado.
  useEffect(() => {
    if (!blocked || access?.kind === 'blocked') return
    const check = () => {
      if (document.visibilityState === 'visible') void refreshProfile()
    }
    const id = window.setInterval(check, 5000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [blocked, access?.kind, refreshProfile])

  if (session && !profile) return <FullScreenLoader />
  if (!blocked) {
    clearPendingPlan() // já tem acesso: o plano escolhido na venda não precisa mais ser lembrado
    return <Outlet />
  }


  const hadPlan = Boolean(profile?.paid_until)

  if (autoPay && pending) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
          <Wallet className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-2xl font-bold">E-mail confirmado!</h1>
        <p className="text-ink-secondary">Levando você ao pagamento do plano {pending.name}…</p>
        <a href={pendingHref} className="text-sm font-semibold text-brand-300 hover:underline">
          Se não abrir sozinho, toque aqui
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
            <Wallet className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Money</span>
        </div>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-secondary transition hover:text-danger"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </header>

      <main className="flex-1 py-10">
        {access?.kind === 'blocked' ? (
          <div className="glass mx-auto max-w-md rounded-3xl p-8 text-center">
            <Lock className="mx-auto h-8 w-8 text-danger" />
            <h1 className="font-display mt-4 text-2xl font-bold">Conta desativada</h1>
            <p className="mt-2 text-sm text-ink-secondary">Fale com o suporte para reativar sua conta.</p>
            <p className="mt-3"><SupportLinks /></p>
          </div>
        ) : (
          <>
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {hadPlan ? 'Sua assinatura terminou' : 'Escolha seu plano para entrar'}
              </h1>
              <p className="mt-3 text-ink-secondary">
                {hadPlan
                  ? 'Renove para voltar a usar o Money. Seus dados continuam guardados.'
                  : 'O acesso ao Money é liberado assim que a Kiwify confirmar o pagamento.'}{' '}
                Use o mesmo e-mail da sua conta{session?.user.email ? ` (${session.user.email})` : ''} no pagamento.
              </p>
            </div>
            {pending && pendingHref && !hadPlan && (
              <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 rounded-3xl border border-brand-400/30 bg-brand-500/10 p-5 text-center">
                <p className="text-sm text-ink-primary">
                  Você escolheu o plano <span className="font-semibold">{pending.name}</span>. Falta só o pagamento.
                </p>
                <a href={pendingHref} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-[#04241C] hover:brightness-110">
                  Ir para o pagamento do {pending.name}
                </a>
                <p className="text-xs text-ink-secondary">Ou escolha outro plano abaixo.</p>
              </div>
            )}
            <div className="mt-10">
              <PlanCards mode="app" email={session?.user.email} userId={session?.user.id} />
            </div>
            <p className="mt-8 text-center text-sm text-ink-muted">
              Já pagou? Esta tela confere sozinha e libera o acesso em instantes.{' '}
              <button onClick={() => void checkPayment()} disabled={syncing} className="font-semibold text-brand-300 hover:underline disabled:opacity-60">
                {syncing ? 'Conferindo…' : 'Conferir pagamento'}
              </button>
            </p>
            {syncMsg && <p className="mx-auto mt-3 max-w-md text-center text-sm text-ink-primary">{syncMsg}</p>}
          </>
        )}
      </main>
    </div>
  )
}
