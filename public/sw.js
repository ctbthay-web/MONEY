/* Service worker do Money: recebe notificações push (mesmo com o app fechado) e abre a tela certa ao clicar. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Ícone por tipo: contas a vencer, atrasadas, recebimentos, cartão, metas, resumo, lembretes.
const EMOJI = {
  due: '⏰',
  overdue: '⚠️',
  receivable: '💰',
  card: '💳',
  goal: '🎯',
  budget: '🧮',
  summary: '📊',
  schedule: '🔔',
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Money', body: event.data ? event.data.text() : '' }
  }
  const prefix = EMOJI[data.kind] ? EMOJI[data.kind] + ' ' : ''
  event.waitUntil(
    self.registration.showNotification(prefix + (data.title || 'Money'), {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon-32x32.png',
      tag: data.tag,
      requireInteraction: data.level === 'alert',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {})
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
