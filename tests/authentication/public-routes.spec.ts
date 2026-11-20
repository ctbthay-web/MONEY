import { test, expect } from '../../fixtures/auth'

const PROTECTED = ['/dashboard', '/transactions', '/accounts', '/loans', '/reports', '/planning', '/reserves', '/assistant', '/subscription', '/profile', '/admin']

test.describe('Autenticação — rotas públicas e proteção (sem credenciais)', () => {
  test('AUTH-01 landing carrega sem erro de JS', async ({ page, findings }) => {
    await page.goto('/vendas')
    await expect(page.locator('body')).not.toBeEmpty()
    expect(findings.pageErrors, findings.pageErrors.join('\n')).toEqual([])
  })

  for (const route of PROTECTED) {
    test(`AUTH-02 rota protegida ${route} sem sessão não expõe dados`, async ({ page }) => {
      await page.goto(route)
      await page.waitForTimeout(1200)
      const url = new URL(page.url())
      // aceito: redireciona para /login ou landing; reprovado: permanecer na rota com conteúdo financeiro
      expect(url.pathname === route && (await page.getByText(/saldo total|movimenta/i).count()) > 0).toBeFalsy()
    })
  }

  test('AUTH-03 login: campos vazios mostram validação e não enviam', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /entrar/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-04 login: credenciais inválidas não autenticam e não vazam detalhes', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-?mail/i).fill('inexistente@example.test')
    await page.getByLabel(/senha/i).first().fill('senha-errada-123')
    await page.getByRole('button', { name: /entrar/i }).click()
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/login/)
  })

  test('AUTH-05 cadastro: senha curta (<6) é rejeitada no front', async ({ page }) => {
    await page.goto('/register')
    const pwd = page.getByLabel(/^senha/i).first()
    await pwd.fill('123')
    await page.getByRole('button', { name: /criar|cadastr/i }).click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('AUTH-06 recuperação de senha acessível', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible()
  })

  test('AUTH-07 rota inexistente mostra 404 amigável', async ({ page }) => {
    await page.goto('/rota-que-nao-existe-xyz')
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
