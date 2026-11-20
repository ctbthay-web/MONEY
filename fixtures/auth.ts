import { type Page } from '@playwright/test'
import { test as base, expect } from './base'
import { USER_A, hasUserA } from '../helpers/env'
import { monitor, type Findings } from '../helpers/monitor'

export async function login(page: Page, u = USER_A) {
  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill(u.email)
  await page.getByLabel(/senha/i).first().fill(u.password)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 20_000 })
}

export const test = base.extend<{ findings: Findings; authed: Page }>({
  findings: async ({ page }, use) => { await use(monitor(page)) },
  authed: async ({ page }, use) => {
    test.skip(!hasUserA, 'Não executado: sem credenciais de teste')
    await login(page)
    await use(page)
  },
})
export { expect }
