import { defineConfig, devices } from '@playwright/test'

/**
 * Money — suíte E2E (auditoria QA 2026).
 * REGRA: nunca apontar para produção com escrita. Use http://localhost:5173 (npm run dev)
 * apontando para um projeto Supabase de TESTE (VITE_SUPABASE_URL do .env.local).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const isProd = /money-app-woad\.vercel\.app|money\.app/i.test(baseURL)
if (isProd && process.env.E2E_ALLOW_PROD_READONLY !== '1') {
  throw new Error('Bloqueado: E2E_BASE_URL aponta para produção. Defina E2E_ALLOW_PROD_READONLY=1 apenas para testes SEM login/escrita.')
}

export default defineConfig({
  testDir: './tests',
  outputDir: './reports/artifacts',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1, // dados financeiros compartilham o mesmo usuário de teste
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/html', open: 'never' }], ['json', { outputFile: 'reports/results.json' }]],
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-android', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-ios', use: { ...devices['iPhone 14'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})
