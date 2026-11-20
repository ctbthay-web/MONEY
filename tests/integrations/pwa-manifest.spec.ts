import { test, expect } from '../../fixtures/base'

test.describe('PWA / integrações estáticas', () => {
  test('INT-01 manifest: start_url entra direto no login e escopo correto', async ({ request }) => {
    const r = await request.get('/manifest.webmanifest')
    expect(r.ok()).toBeTruthy()
    const m = await r.json()
    expect(m.start_url).toBe('/login')
    expect(m.display).toBe('standalone')
    expect(m.icons.length).toBeGreaterThanOrEqual(3)
  })
  test('INT-02 service worker é servido como JS', async ({ request }) => {
    const r = await request.get('/sw.js')
    expect(r.ok()).toBeTruthy()
    expect(r.headers()['content-type']).toMatch(/javascript/)
  })
  test('INT-03 ícones do manifest existem', async ({ request }) => {
    for (const p of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/favicon.svg']) {
      expect((await request.get(p)).ok(), p).toBeTruthy()
    }
  })
})
