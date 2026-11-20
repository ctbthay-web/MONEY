import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthProvider'
import { computeAccess } from '../../lib/access'

/** Aviso no topo: acesso encerrado. Some para quem tem acesso em dia. */
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

  return null
}
