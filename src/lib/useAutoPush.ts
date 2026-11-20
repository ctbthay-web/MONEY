import { useEffect, useRef } from 'react'
import { useAuth } from '../features/auth/AuthProvider'
import { useNotificationPrefs } from './queries/useNotifications'
import { pushPermission, pushSupported, registerServiceWorker, subscribeThisDevice } from './push'

/**
 * Notificações vêm ATIVADAS por padrão: ao entrar no app, se o usuário não desativou, registra o service
 * worker e inscreve este aparelho (o próprio navegador pergunta a permissão na primeira vez — não há
 * tela nossa pedindo). Se a permissão já foi negada, respeita e não insiste.
 */
export function useAutoPush() {
  const { user } = useAuth()
  const { data: prefs } = useNotificationPrefs()
  const done = useRef<string | null>(null)

  useEffect(() => {
    if (!user || !prefs || !pushSupported()) return
    void registerServiceWorker()
    if (!prefs.enabled || done.current === user.id) return
    const permission = pushPermission()
    if (permission === 'denied') return
    done.current = user.id
    void subscribeThisDevice()
  }, [user, prefs])
}
