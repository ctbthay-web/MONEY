import { test as base, expect } from '@playwright/test'

/**
 * Sem credenciais de teste (testes públicos): bloqueia TODO host externo (Supabase, fontes, analytics),
 * garantindo que nenhum teste toque produção ou terceiros. Com credenciais de TESTE, o bloqueio é desligado.
 */
const block = !(process.env.TEST_USER_A_EMAIL && process.env.TEST_USER_A_PASSWORD) && process.env.E2E_BLOCK_EXTERNAL !== '0'
export const test = base.extend<{ _isolate: void }>({
  _isolate: [async ({ context }, use) => {
    if (block) {
      await context.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (r) => r.abort())
    }
    await use()
  }, { auto: true }],
})
export { expect }
