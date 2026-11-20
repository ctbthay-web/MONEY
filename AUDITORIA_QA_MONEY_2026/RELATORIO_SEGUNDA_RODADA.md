# Relatório da 2ª rodada — correções e validação (11/11/2026)

## Parecer: NÃO APROVADO (provisório) para comercialização
As três falhas ALTA têm correção pronta e **validada num motor PostgreSQL real**, mas nada foi aplicado em homologação nem produção, o webhook não foi testado com a Kiwify de verdade, não existe ainda Supabase de homologação e os testes de interface autenticados, Firefox e WebKit não rodaram. O parecer sobe para **APROVADO COM RESSALVAS** quando os itens da seção "Para destravar" forem cumpridos.

## Como foi trabalhado (regras da fase)
- "Branch": o projeto não é um repositório git → tudo está em `FASE2_CORRECOES/`; os arquivos originais não foram tocados. Reversão: `sql/027_ROLLBACK.sql` (testado) + manter o `kiwify-webhook.js` anterior.
- Nenhuma alteração em produção, nenhum dado real, nenhum preço/plano alterado, nenhuma integração removida.
- Método de teste: as 26 migrações reais foram carregadas no **PGlite (PostgreSQL real em memória)** com stubs de `auth.uid()` e papéis `anon/authenticated/service_role`. Isso valida SQL, RLS e triggers de verdade; **não** valida Supabase/PostgREST, Vercel nem Kiwify reais. O handler do webhook foi testado com requisições simuladas (HMAC real) falando com as funções SQL reais — é teste de unidade/integração parcial, **não** integração com a Kiwify.

## Problemas corrigidos (na branch; ainda não aplicados)
| ID | Situação | Evidência |
|---|---|---|
| ALTA-01 cota burlável | Corrigido na 027 (`created_at` sempre do servidor; série só nasce em um lote, máx. 60; `created_at/series_id/user_id` imutáveis). ANTES: reproduzido (40 lançamentos aceitos no Start com data forjada). DEPOIS: 25. Parcelamento 24x legítimo continua contando 1. | attack1 × attack3 |
| ALTA-02 assinatura Kiwify | Corrigido: confere o corpo bruto (bytes originais), com reserva para o JSON re-serializado (formato da documentação da Kiwify), em tempo constante; adulteração, ausência e tamanho errado recusados; só `order_status=paid` libera. | webhook-test SIG/HTTP/PAG |
| ALTA-03 liberação de acesso | Corrigido: evento e liberação na MESMA transação SQL (`kiwify_apply_grant`); falha → HTTP 500 → reenvio libera. Plano não identificado → fila `billing_dead_letters` + 500 (antes: 200 e o cliente ficava sem acesso). Falha simulada no gravar-perfil: evento não fica concluído; reenvio libera. | FAL-01/02, PAG-11/12 |
| M-01 renovação com mesmo order_id | Mitigado: a chave do evento inclui `approved_date`/`next_payment` (estáveis entre reenvios). **Hipótese sobre o payload real; confirmar no sandbox da Kiwify.** | REN-01/02 |
| M-03 recursos por plano só na tela | Corrigido no banco para empréstimos (≥Plus), orçamento e lembretes (≥Pro): chamada direta à API é barrada; admin/vitalício/teste liberados; expirado barrado. PDF/CSV/importação de fatura são geração local dos dados do próprio usuário → não há como impor no servidor (aceito); assistente já era protegido (025). | attack4 |
| B-04 `.vercelignore` | Arquivo criado (não aplicado). | — |
Regressão financeira: saldos idênticos antes e depois da 027/027b (despesa, receita, transferência, parcelas, cartão, empréstimo, pagamento de empréstimo); transferência e empréstimo não viram despesa/receita. Reversão testada (a falha volta a existir após o rollback, como esperado).

## Problemas ainda existentes / pendentes
| ID | Estado |
|---|---|
| D1 (novo) apagar lançamento devolve cota | CONFIRMADO: 75 lançamentos num mês de limite 25 (criar, apagar, repetir). Solução pronta em `027b` (testada: 25), **aguarda decisão** porque muda o comportamento visível. |
| M-02 preços | Mapeados; nada alterado — ver PRECOS_E_PLANOS.md (decisão sua). |
| M-04 AuthProvider (loader infinito) | Confirmado por leitura: sem `catch/finally`. Patch **proposto, não testado** (exige build + teste de tela). |
| M-05 bloqueio de login só no cliente | Sem correção de código; conferir limites de taxa do Supabase Auth na homologação. |
| M-06 Asaas | Diagnóstico em DIAGNOSTICO_ASAAS.md; **nada desativado**. O webhook do Asaas tem o mesmo padrão da ALTA-03 e o endpoint `billing-subscribe` continua exposto. |
| M-07 bundle 1,4 MB | Não feito (exige build; é melhoria de desempenho — prioridade depois de cobrança/segurança). |
| B-01 senha mínima 6, B-03, B-05 | Não feitos. B-02 (`balance_cents` gravável) analisado: o formulário de conta usa isso para saldo inicial → mantido; só afeta os dados do próprio usuário. |
| ND-02 (novo) | `KIWIFY_PRODUCT_START/PLUS/PRO/PREMIUM` não existem na Vercel; o plano é deduzido do nome do plano/produto na Kiwify. Se renomearem, deixava de liberar; agora falha de forma visível (fila + 500), mas convém preencher os IDs. |
| Correção ao relatório anterior | O `vercel.json` JÁ tem CSP, X-Frame-Options, nosniff e Permissions-Policy; a recomendação de "adicionar headers" era imprecisa (HSTS é aplicado pela Vercel). |

## Testes
| Grupo | Aprov. | Reprov. | Observação |
|---|---|---|---|
| Webhook (assinatura, HTTP, pagamentos, falha simulada, pendentes, renovação) | 29 | 0 | PGlite + handler simulado |
| Regressão financeira + isolamento A×B (11 tabelas, tabelas de cobrança, funções) | 11 | 0 | PGlite |
| Cota/segurança (ataques antes/depois) | 10 | 0 | mais 1 de rollback e 1 de ledger 027b; 1 verificação inconclusiva (T9a) substituída por attack4 |
| Recursos por plano (Start/Plus/Pro/Premium/vitalício/expirado/usuário B) | 7 | 0 | |
| Proteção de perfil (plan/paid_until/is_lifetime/role/billing) e RLS de perfil | 9 | 0 | usuário não consegue se dar acesso |
| Playwright público (Chromium + Android emulado), rodada 1 | 84 | 0 | não reexecutado: a interface não mudou |
**Não executados:** Firefox e WebKit (e iPhone, que usa WebKit) — o download dos navegadores é bloqueado neste ambiente; testes E2E autenticados com usuários A/B (sem Supabase de homologação); webhook com a Kiwify real; concorrência real de eventos simultâneos; notificações push; relatórios/dashboard/assistente na interface; desempenho autenticado.

## Para destravar o lançamento
1. Criar o Supabase de homologação (HOMOLOGACAO.md), aplicar a 027 e rodar o seed A/B.
2. Rodar a suíte Playwright completa (3 navegadores + celulares) com A e B; reexecutar os testes de regressão de tela.
3. Deploy de PREVIEW do webhook e eventos do sandbox da Kiwify (compra, renovação, recusa, reembolso, cancelamento, atraso).
4. Sua decisão sobre 027b, preços e Asaas.
5. Depois, aplicar em produção com backup, na ordem de APLICAR.md.

## Riscos restantes
Quem já burlou a cota continua com os lançamentos que criou (a correção não apaga dados). A validação da assinatura depende do formato real do corpo da Kiwify (há reserva, mas só o sandbox confirma). Enquanto não aplicadas, as falhas ALTA continuam em produção.
