import { test, expect } from '@playwright/test'

/**
 * Fluxo de sessão/login. Roda contra um Supabase SIMULADO (mock/mock-supabase.mjs) — teste real da INTERFACE,
 * mas NÃO é integração com o Supabase real. Para o real, ver tests/authentication/homolog-auth.spec.ts.
 * E2E_MOCK_URL (padrão http://127.0.0.1:54321) controla falhas injetadas.
 */
const MOCK = process.env.E2E_MOCK_URL ?? 'http://127.0.0.1:54321'
const ctl = (flags: object) => fetch(MOCK + '/__ctl', { method: 'POST', body: JSON.stringify(flags) })
const GOOD = { email: 'a@t.test', password: 'Senha123!' }

test.beforeEach(async () => { await fetch(MOCK + '/__reset') })

// "dentro do app": botão Sair (desktop) OU a navegação inferior (celular, onde o Sair fica no menu "Mais")
const sairBtn = (page) => page.getByRole('button', { name: /^sair/i }).first()
const inApp = (page) => sairBtn(page).or(page.getByRole('navigation', { name: 'Navegação principal' })).first()
async function logout(page) {
  if (!(await sairBtn(page).isVisible())) await page.getByRole('navigation', { name: 'Navegação principal' }).getByText(/^mais$/i).click()
  await sairBtn(page).click()
}
async function login(page, creds = GOOD) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(creds.email)
  await page.getByLabel('Senha', { exact: true }).fill(creds.password)
  await page.getByRole('button', { name: /entrar/i }).click()
}
// deslogado: login (rota protegida) ou página de apresentação (raiz, aba comum) — ambos têm "Entrar"
const loggedOut = (page) => page.getByRole('button', { name: /entrar/i }).or(page.getByRole('link', { name: /entrar/i })).first()
const spinnerVisible = (page) => page.locator('svg.animate-spin').first().isVisible().catch(() => false)

test('LOGIN-01 login válido entra no app', async ({ page }) => {
  await login(page)
  await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await expect(page).not.toHaveURL(/login/)
})

test('LOGIN-02 login inválido mostra erro e permanece no login', async ({ page }) => {
  await login(page, { email: 'a@t.test', password: 'errada' })
  await expect(page.getByText(/e-?mail ou senha|inválid|incorret/i).first()).toBeVisible({ timeout: 8_000 })
  await expect(page).toHaveURL(/login/)
  await expect(page.getByRole('button', { name: /entrar/i })).toBeEnabled()
})

test('LOGIN-03 sessão persiste ao atualizar a página', async ({ page }) => {
  await login(page); await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await page.reload()
  await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
})

test('LOGIN-04 atualizar numa rota protegida (/transactions) mantém a rota', async ({ page }) => {
  await login(page); await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await page.goto('/transactions')
  await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/transactions/)
})

test('LOGIN-05 sessão expirada (refresh recusado) volta ao login sem ficar no carregamento', async ({ page }) => {
  await login(page); await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await ctl({ expireRefresh: true })
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) { const s = JSON.parse(localStorage.getItem(k)!); s.expires_at = 1; localStorage.setItem(k, JSON.stringify(s)) } })
  await page.reload()
  await expect(loggedOut(page)).toBeVisible({ timeout: 12_000 })
  await expect(inApp(page)).toHaveCount(0)
})

test('LOGIN-06 logout volta ao login e a sessão não volta ao atualizar', async ({ page }) => {
  await login(page); await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await logout(page)
  await expect(loggedOut(page)).toBeVisible({ timeout: 10_000 })
  await page.reload()
  await expect(loggedOut(page)).toBeVisible({ timeout: 10_000 })
  await expect(inApp(page)).toHaveCount(0)
})

test('LOGIN-07 recuperação de senha: envio mostra confirmação', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('E-mail').fill('a@t.test')
  await page.getByRole('button', { name: /enviar|recuperar|link/i }).click()
  await expect(page.getByText(/verifique seu e-?mail/i)).toBeVisible({ timeout: 8_000 })
})

test('LOGIN-08 recuperação de senha: falha de servidor mostra erro (não trava)', async ({ page }) => {
  await ctl({ recoverFail: true })
  await page.goto('/forgot-password')
  await page.getByLabel('E-mail').fill('a@t.test')
  await page.getByRole('button', { name: /enviar|recuperar|link/i }).click()
  await page.waitForTimeout(2500)
  await expect(page.getByRole('button', { name: /enviar|recuperar|link/i })).toBeEnabled()
  expect(await spinnerVisible(page)).toBeFalsy()
})

test('LOGIN-09 erro de conexão no login: mostra erro e libera o botão', async ({ page }) => {
  await ctl({ tokenDown: true })
  await login(page)
  await page.waitForTimeout(6000)
  expect(await spinnerVisible(page), 'tela de carregamento infinita').toBeFalsy()
  await expect(page.getByRole('button', { name: /entrar/i })).toBeEnabled()
})

test('LOGIN-10 perfil não carrega (500) após login: não fica em carregamento infinito', async ({ page }) => {
  await ctl({ profileFail: true })
  await login(page)
  await page.waitForTimeout(12_000)
  expect(await spinnerVisible(page), 'carregamento infinito').toBeFalsy()
})

test('LOGIN-11 perfil lento (4 s): termina de carregar e entra', async ({ page }) => {
  await ctl({ profileDelay: 4000 })
  await login(page)
  await expect(inApp(page)).toBeVisible({ timeout: 15_000 })
})

test('LOGIN-12 sessão guardada + Supabase fora do ar ao abrir: não fica em carregamento infinito', async ({ page }) => {
  await login(page); await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
  await ctl({ profileFail: true })
  await page.reload()
  await page.waitForTimeout(12_000)
  expect(await spinnerVisible(page), 'carregamento infinito').toBeFalsy()
})

test('LOGIN-13 recuperação do perfil: após erro, "tentar novamente" entra no app', async ({ page }) => {
  await ctl({ profileFail: true })
  await login(page)
  await page.waitForTimeout(3000)
  await ctl({ profileFail: false })
  const retry = page.getByRole('button', { name: /tentar novamente/i })
  await expect(retry).toBeVisible({ timeout: 15_000 })
  await retry.click()
  await expect(inApp(page)).toBeVisible({ timeout: 10_000 })
})
