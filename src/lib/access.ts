import type { Profile } from '../types/database'


export type AccessState =
  | { kind: 'admin' }
  | { kind: 'lifetime' }
  | { kind: 'active'; until: Date; daysLeft: number }
  | { kind: 'expired' }
  | { kind: 'blocked' }

const DAY_MS = 86_400_000

/**
 * Espelha public.has_access() do banco — só para mostrar avisos na tela. Quem realmente
 * barra a gravação é o banco (trigger a00_paywall), então adulterar isso no navegador não
 * dá acesso a nada.
 */
export function computeAccess(profile: Profile | null, now = new Date()): AccessState | null {
  if (!profile) return null
  if (!profile.is_active) return { kind: 'blocked' }
  if (profile.role === 'admin') return { kind: 'admin' }
  if (profile.is_lifetime) return { kind: 'lifetime' }

  const paid = profile.paid_until ? new Date(profile.paid_until) : null
  if (paid && paid > now) return { kind: 'active', until: paid, daysLeft: Math.ceil((paid.getTime() - now.getTime()) / DAY_MS) }

  // Não existe mais teste grátis: sem pagamento em dia (e sem ser admin/vitalício) a conta fica "expired".

  return { kind: 'expired' }
}
