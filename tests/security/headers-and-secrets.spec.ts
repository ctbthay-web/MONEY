import { test, expect } from '../../fixtures/base'

test.describe('Segurança — superfície pública', () => {
  test('SEC-01 bundle não contém service_role nem segredos conhecidos', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async (r) => {
      const ct = r.headers()['content-type'] ?? ''
      if (/javascript|json|html/.test(ct)) bodies.push(await r.text().catch(() => ''))
    })
    await page.goto('/')
    await page.waitForTimeout(1200)
    const all = bodies.join('\n')
    expect(all).not.toMatch(/service_role/i)
    expect(all).not.toMatch(/KIWIFY_(WEBHOOK_)?TOKEN|ASAAS_API_KEY|VAPID_PRIVATE/i)
  })
  test('SEC-02 webhook Kiwify rejeita requisição sem assinatura (somente se rodando contra deploy de teste)', async ({ request }) => {
    test.skip(!process.env.E2E_API_BASE, 'Não executado: defina E2E_API_BASE (deploy de TESTE com /api). Nunca produção.')
    const r = await request.post(`${process.env.E2E_API_BASE}/api/kiwify-webhook`, { data: { order_status: 'paid' } })
    expect([400, 401, 403]).toContain(r.status())
  })
})
