# Falhas e correções propostas (nenhuma aplicada em produção)
Todas são achados de análise estática; "confirmar" = precisa de teste dinâmico em ambiente de teste.

## ALTA
**ALTA-01 — Cota mensal burlável.** Local: `sql/022–024` (`z_tx_quota`, `tx_usage`) + `useTransactions.buildSeriesRows`. Causa: a cota conta pelo `created_at`/`series_id` que o cliente pode enviar (colunas graváveis; série conta como 1). Reprodução: inserir via API com a anon key logada várias linhas com `created_at` em mês passado ou o mesmo `series_id`. Impacto: usuário Start usa ilimitado → perda de receita. Correção: forçar `created_at = now()` e validar/gerar `series_id` por trigger BEFORE INSERT; limitar tamanho de série. Módulos: transações, planos.
**ALTA-02 — HMAC Kiwify sobre `JSON.stringify(req.body)`.** Local: `api/kiwify-webhook.js`. Causa: a assinatura deve ser calculada sobre o corpo bruto; reserializar pode alterar bytes. Impacto: pagamentos legítimos rejeitados (cliente pagou e não ganha acesso) ou validação inconsistente. Correção: ler corpo bruto (`bodyParser:false`), usar `timingSafeEqual`. Confirmar com evento real de sandbox.
**ALTA-03 — Idempotência antes da efetivação.** Local: mesmo arquivo. Causa: o evento é gravado em `billing_events` e depois `profiles` é atualizado sem checar `error`. Impacto: se a atualização falhar, o retry da Kiwify é descartado como duplicado → cliente pago sem acesso. Correção: processar e só então marcar o evento (ou apagar o registro em caso de erro) e responder 5xx para forçar retry.

## MÉDIA
- M-01 Renovações: `payment_id = kiwify:{order}:{event||status}` pode colidir entre cobranças do mesmo pedido (confirmar).
- M-02 Tabela de preços: código = 19,90/29,90/39,90/59,90 (1ª 9,90/19,90/29,90/39,90); o brief pode divergir — confirmar a oficial.
- M-03 Recursos por plano (empréstimos, PDF/CSV, planejamento, assistente) são bloqueados só na UI; as tabelas aceitam escrita de qualquer plano pago. Correção: checagem em RLS/trigger.
- M-04 `AuthProvider`: risco de loader infinito se a sessão/perfil falhar (confirmar).
- M-05 Bloqueio de tentativas de login só no cliente — contornável; depender do rate-limit do Supabase.
- M-06 Asaas legado ainda ativo em produção (`api/billing-*`, comparação de token não timing-safe). Desativar ou isolar.
- M-07 Bundle JS único de 1,4 MB (≈398 KB gzip): carga lenta em 3G. Dividir por rota (lazy) e carregar jsPDF/html2canvas sob demanda.

## BAIXA
- B-01 Senha mínima 6 caracteres (subir para 8+ e ativar proteção de senha vazada no Supabase).
- B-02 `accounts.balance_cents` gravável pelo próprio usuário (só afeta os próprios dados; restringir a triggers).
- B-03 Erros de `update/upsert` de perfil não verificados no front.
- B-04 Adicionar `.vercelignore` com `.env*` (o `.gitignore` já ignora).
- B-05 Mensagens de login/cadastro: validar texto/acessibilidade (os testes só verificam permanência na tela).
Ação do dono: **trocar a senha que foi colada no chat** em sessão anterior.

## Reteste/regressão
Após corrigir em branch/dev: rodar `npx playwright test` completo (com credenciais de teste) e anexar o relatório HTML. Ainda não foi feito (nada foi corrigido neste ciclo).
