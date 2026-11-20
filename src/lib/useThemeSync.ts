import { useEffect } from 'react'
import { useAuth } from '../features/auth/AuthProvider'
import {
  ACCOUNT_THEME_KEY,
  DEFAULT_THEME,
  hasPendingThemePush,
  loadTheme,
  normalizeTheme,
  pushThemeToAccount,
  sameTheme,
  saveTheme,
} from './theme'

/**
 * A cor escolhida fica guardada na CONTA da pessoa e só muda quando ela mesma mudar:
 * ao entrar em qualquer aparelho, o tema da conta é aplicado; se a conta ainda não tem
 * (escolheu antes de existir esse recurso), sobe o que já está neste aparelho.
 */
export function useThemeSync() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user || hasPendingThemePush()) return
    const remote = normalizeTheme((user.user_metadata as Record<string, unknown> | undefined)?.[ACCOUNT_THEME_KEY])
    const local = loadTheme()
    if (remote) {
      if (!sameTheme(remote, local)) saveTheme(remote)
    } else if (!sameTheme(local, DEFAULT_THEME)) {
      pushThemeToAccount(local)
    }
  }, [user])
}
