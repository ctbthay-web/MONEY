// Notificações push no navegador/aparelho: service worker + inscrição Web Push.
import { supabase } from './supabase'

// Chave PÚBLICA do VAPID (pode ficar no código). A privada fica só nas variáveis da Vercel.
export const VAPID_PUBLIC_KEY =
  'BBkcwpLCprog77_BmfYvOyqKgI6yIaa1PDCYYw-7Zvzjjsp3b17trj7pHO6kcwELfKnhbmaV1TqECNcP0vh47aE'

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'error'

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported'
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    await navigator.serviceWorker.register('/sw.js')
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/** Pede a permissão do navegador (se ainda não foi decidida) e inscreve ESTE aparelho para o usuário logado. */
export async function subscribeThisDevice(): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported'
  try {
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (permission !== 'granted') return 'denied'

    const reg = await registerServiceWorker()
    if (!reg) return 'error'
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'error'
    const res = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

/** Remove a inscrição deste aparelho (a permissão do navegador continua como está). */
export async function unsubscribeThisDevice() {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch {
    /* sem inscrição para remover */
  }
}

/** Notificação de teste local (não passa pelo servidor), só para ver como aparece. */
export async function showTestNotification() {
  const reg = await registerServiceWorker()
  if (!reg || Notification.permission !== 'granted') return false
  await reg.showNotification('⏰ Conta próxima do vencimento', {
    body: 'Sua conta de energia de R$ 185,90 vence amanhã (06/11). Este é um teste.',
    icon: '/icon-192.png',
    badge: '/favicon-32x32.png',
    data: { url: '/transactions' },
  })
  return true
}
