import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'

/**
 * Página de retorno da Kiwify (/obrigado). Configure este endereço como "URL de redirecionamento após a compra" no produto da Kiwify.
 * IMPORTANTE: esta página NÃO libera nada. O plano só é liberado quando o servidor recebe e valida o aviso de pagamento aprovado
 * (api/kiwify-webhook). Aqui a pessoa só é orientada a entrar com o e-mail e a senha do cadastro.
 */
export function ThankYouPage() {
  const { session } = useAuth()
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
        <Wallet className="h-6 w-6" strokeWidth={2.5} />
      </div>
      <h1 className="font-display text-2xl font-bold">Estamos confirmando seu pagamento</h1>
      <p className="text-ink-secondary">
        A Kiwify avisa o Money assim que o pagamento é aprovado, o que pode levar alguns minutos.
        {session
          ? ' Depois disso, o plano aparece liberado na sua conta.'
          : ' Se você já tem conta, entre com seu e-mail e senha. Se ainda não criou a sua, crie agora usando o MESMO e-mail da compra: o plano é liberado assim que o pagamento for confirmado.'}
      </p>
      <Link
        to={session ? '/' : '/login'}
        className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-[#04241C] hover:brightness-110"
      >
        {session ? 'Abrir o Money' : 'Já tenho conta — entrar'}
      </Link>
      {!session && (
        <Link
          to="/register"
          className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border text-sm font-semibold text-ink-primary hover:bg-white/[0.06]"
        >
          Ainda não tenho conta — criar agora
        </Link>
      )}
      <p className="text-xs text-ink-muted">Se o plano não aparecer em alguns minutos, fale com o suporte.</p>
    </div>
  )
}
