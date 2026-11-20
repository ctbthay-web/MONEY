import { Link } from 'react-router-dom'
import { AlertTriangle, Lock } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthProvider'
import { computeAccess } from '../../lib/access'

/**
 * Aviso no topo: acesso encerrado, ou assinatura perto de terminar sem renovação garantida
 * (cancelada ou com pagamento da renovação atrasado). Some para quem está em dia.
 */
export function AccessBanner() {
  const { profile } = useAuth()
  const access = computeAccess(profile)
  if (!access) return null

  if (access.kind === 'expired' || access.kind === 'blocked') {
    return (
      <Link
        to="/subscription"
        className="mb-4 flex items-center gap-2.5 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-ink-primary"
      >
        <Lock className="h-4 w-4 shrink-0 text-danger" />
        <span className="min-w-0 flex-1">
          {access.kind === 'blocked'
            ? 'Sua conta está desativada. Você só consegue consultar seus dados.'
            : 'Seu acesso terminou: você pode consultar seus dados, mas não registrar nem editar.'}
        </span>
        {access.kind === 'expired' && <span className="shrink-0 font-semibold text-brand-300">Assinar</span>}
      </Link>
    )
  }

  const status = profile?.billing_status
  if (access.kind === 'active' && access.daysLeft <= 5 && (status === 'canceled' || status === 'past_due')) {
    const when =
      access.daysLeft <= 0 ? 'hoje' : access.daysLeft === 1 ? 'amanhã' : `em ${access.daysLeft} dias (${access.until.toLocaleDateString('pt-BR')})`
    return (
      <Link
        to="/subscription"
        className="mb-4 flex items-center gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink-primary"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <span className="min-w-0 flex-1">
          {status === 'canceled'
            ? `Sua assinatura foi cancelada e o acesso termina ${when}.`
            : `O pagamento da renovação está pendente e o acesso termina ${when}. Pague o código que a Kiwify enviou por e-mail.`}
        </span>
        <span className="shrink-0 font-semibold text-brand-300">{status === 'canceled' ? 'Assinar' : 'Ver'}</span>
      </Link>
    )
  }

  return null
}
