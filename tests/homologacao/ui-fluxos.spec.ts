/**
 * Money — fluxos de TELA contra o app apontando para o Supabase de HOMOLOGAÇÃO (E2E_BASE_URL=http://localhost:5173 com .env.local de homologação).
 * Usa as telas reais; sem homologação ficam "Bloqueado por dependência externa". Seletores de formulários que ainda não foram
 * confirmados em tela real ficam como test.fixme (Não executado) — não são dados como aprovados.
 */
import { test, expect } from '../../fixtures/auth'
import { READY, BLOCKED_MSG, assertNotProduction } from '../../helpers/homolog'

test.skip(!READY, BLOCKED_MSG)
test.beforeAll(() => assertNotProduction())

const ROTAS: [string, RegExp][] = [
  ['/', /painel|resumo|saldo|olá|bom dia|boa tarde|boa noite/i], ['/transactions', /lançamentos|transaç/i], ['/accounts', /contas/i],
  ['/goals', /metas/i], ['/reports', /relat/i], ['/loans', /empréstimos/i], ['/subscription', /assinatura|plano/i],
]
test.describe('Navegação autenticada', () => {
  for (const [rota, texto] of ROTAS) {
    test(`NAV ${rota} abre sem erro de console`, async ({ authed, findings }) => {
      await authed.goto(rota); await expect(authed.locator('body')).toContainText(texto, { timeout: 15_000 })
      expect([...findings.console, ...findings.pageErrors], 'erros de console/JS').toEqual([])
    })
  }
})
test('SESS-01 atualizar a página mantém a sessão', async ({ authed }) => {
  await authed.reload(); await expect(authed.getByRole('button', { name: /^sair/i }).first()).toBeVisible({ timeout: 15_000 })
})
test('SESS-02 logout volta ao login', async ({ authed }) => {
  await authed.getByRole('button', { name: /^sair/i }).first().click(); await expect(authed.getByRole('button', { name: /entrar/i }).or(authed.getByRole('link', { name: /entrar/i })).first()).toBeVisible()
})
test.fixme('SYNC-UI cadastro em um navegador aparece em outro (2 contextos)', async () => {
  /* Não executado: precisa do formulário de novo lançamento confirmado em tela real. A sincronização em nível de banco
     (dois dispositivos, mesmo usuário) é coberta de verdade por SYNC-01 em api-backend.spec.ts. */
})
test.fixme('SIGNUP-01 cadastro de conta nova (e-mail .test) cria perfil e entra', async () => { /* Não executado: depende do e-mail de confirmação do Supabase de homologação */ })
test.fixme('PWA-01 iPhone/WebKit/Firefox', async () => { /* Não executado: navegadores indisponíveis neste ambiente — rode localmente: npx playwright install firefox webkit */ })
