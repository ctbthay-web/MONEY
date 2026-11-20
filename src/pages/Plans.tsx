import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { PlanCards } from '../components/finance/PlanCards'
import { FullScreenLoader } from '../components/ui/FullScreenLoader'
import { useAuth } from '../features/auth/AuthProvider'

/**
 * Página de planos (/planos): endereço próprio, independente da venda (/vendas), do pagamento (Kiwify) e do acesso (/login).
 * Visitante: cada plano leva ao cadastro daquele plano. Já logado: cada plano leva ao pagamento dele na Kiwify.
 */
export function PlansPage() {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoader />

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Link to="/vendas" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
            <Wallet className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Money</span>
        </Link>
        <Link to={session ? '/' : '/login'} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary">
          {session ? 'Ir para o app' : 'Entrar'}
        </Link>
      </header>

      <main className="flex-1 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Escolha seu plano</h1>
          <p className="mt-3 text-ink-secondary">
            {session
              ? `Use o mesmo e-mail da sua conta${session.user.email ? ` (${session.user.email})` : ''} no pagamento.`
              : 'Crie sua conta com o plano escolhido e siga para o pagamento.'}
          </p>
        </div>
        <div className="mt-10">
          <PlanCards mode={session ? 'app' : 'landing'} email={session?.user.email} userId={session?.user.id} />
        </div>
        {!session && (
          <p className="mt-8 text-center text-sm text-ink-secondary">
            Já tem conta?{' '}
            <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
              Entrar
            </Link>
          </p>
        )}
      </main>
    </div>
  )
}
