import { test, expect } from '../../fixtures/auth'

// Esqueleto do módulo "ai-assistant" — NÃO EXECUTADO (exige TEST_USER_A_* em projeto Supabase de TESTE).
// Cenários e regras: ver documentation/PLANO_DE_TESTES.md e AUDITORIA_QA_MONEY_2026/TESTES_FINANCEIROS.md
test.describe('ai-assistant', () => {
  test('ai-assistant: abre sem erro de console/rede', async ({ authed, findings }) => {
    await authed.waitForTimeout(1500)
    expect(findings.pageErrors).toEqual([])
    expect(findings.badResponses).toEqual([])
  })
  test.fixme('ai-assistant: regras de negócio específicas', async () => { /* implementar com dados do seed */ })
})
