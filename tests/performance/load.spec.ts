import { test, expect } from '../../fixtures/base'

test('PERF-01 landing: carga e tamanho de JS (build de desenvolvimento — indicativo)', async ({ page }) => {
  const t0 = Date.now()
  let bytes = 0
  page.on('response', async (r) => { const h = r.headers()['content-length']; if (h) bytes += Number(h) })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const ms = Date.now() - t0
  console.log(`PERF landing load=${ms}ms transfer≈${bytes}B`)
  expect(ms).toBeLessThan(10_000)
})
