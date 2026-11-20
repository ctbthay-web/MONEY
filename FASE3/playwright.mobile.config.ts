import { defineConfig, devices } from '@playwright/test'
// iPhone EMULADO no Chromium (viewport/UA/toque do iPhone 14). NÃO é o WebKit/Safari real.
export default defineConfig({ testDir: './tests', timeout: 40_000, workers: 1, reporter: [['list']], use: { baseURL: 'http://127.0.0.1:5173', locale: 'pt-BR' },
  projects: [{ name: 'iphone14-emulado-chromium', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } }] })
