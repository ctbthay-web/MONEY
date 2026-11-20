import { test, expect } from '../../fixtures/auth'

const PAGES = ['/', '/login', '/register', '/forgot-password']
const SIZES = [
  { name: 'celular-320', width: 320, height: 640 },
  { name: 'celular-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'notebook-1366', width: 1366, height: 768 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
]

for (const s of SIZES) for (const p of PAGES) {
  test(`RESP ${s.name} ${p}: sem rolagem horizontal e sem erro JS`, async ({ page, findings }) => {
    await page.setViewportSize({ width: s.width, height: s.height })
    await page.goto(p)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await page.screenshot({ path: `screenshots/${s.name}${p.replace(/\//g, '_') || '_home'}.png`, fullPage: true })
    expect(overflow, `rolagem horizontal de ${overflow}px`).toBeLessThanOrEqual(1)
    expect(findings.pageErrors).toEqual([])
  })
}
