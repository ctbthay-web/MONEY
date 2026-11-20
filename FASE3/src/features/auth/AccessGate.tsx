import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Lock, LogOut, Wallet } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { FullScreenLoader } from '../../components/ui/FullScreenLoader'
import { PlanCards } from '../../components/finance/PlanCards'
import { computeAccess } from '../../lib/access'

/**
 * Só entra no app quem tem acesso (assinatura paga confirmada pela Kiwify, admin, vitalício ou conta
 * ainda em teste antiga). Quem não tem vê apenas a escolha de plano. É a barreira de TELA; a barreira
 * real de gravação continua no banco (trigger a00_paywall).
 */
export function AccessGate() {
  const { session, profile, profileStatus, retryProfile, refreshProfile, signOut } = useAuth()
  const access = computeAccess(profile)
  const blocked = access?.kind === 'expired' || access?.kind === 'blocked'

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

  if (session && !profile) {
    // perfil não carregou (rede/servidor): em vez de carregamento infinito, oferece nova tentativa ou sair
    if (profileStatus === 'error') {
      return (
        <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-display text-xl font-bold">Não foi possível carregar sua conta</h1>
          <p className="max-w-sm text-sm text-ink-secondary">Verifique sua conexão e tente novamente. Seus dados continuam seguros.</p>
          <div className="flex gap-3">
            <button onClick={() => void retryProfile()} className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-[#04241C]">
              Tentar novamente
            </button>
            <button onClick={() => void signOut()} className="rounded-full px-5 py-2 text-sm font-medium text-ink-secondary hover:text-danger">
              Sair
            </button>
          </div>
        </div>
      )
    }
    return <FullScreenLoader />
  }
  if (!blocked) return <Outlet />

  const hadPlan = Boolean(profile?.paid_until)

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
            <div className="mt-10">
              <PlanCards mode="app" email={session?.user.email} />
            </div>
            <p className="mt-8 text-center text-sm text-ink-muted">
              Já pagou? Esta tela confere sozinha e libera o acesso em instantes.{' '}
              <button onClick={() => void refreshProfile()} className="font-semibold text-brand-300 hover:underline">
                Conferir agora
              </button>
            </p>
          </>
        )}
      </main>
    </div>
  )
}
