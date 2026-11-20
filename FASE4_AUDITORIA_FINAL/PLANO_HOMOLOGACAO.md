# Plano de Homologação — Money
Estado: **BLOQUEADO POR DEPENDÊNCIA EXTERNA** (o Supabase de homologação não existe). Nada será contornado usando produção. Tudo abaixo usa dados fictícios (`.test`).

## Etapa 0 — Preparação (você)
1. Criar um projeto Supabase NOVO ("money-homolog"), **fora do plano Free se quiser testar backup**. 2. Preencher `.env.local` a partir de `FASE3/homologacao/homologacao.env.exemplo.txt` (anon + service role **de homologação**). 3. Habilitar `pg_cron`/`pg_net` se necessário.
## Etapa 1 — Banco
Rodar `FASE3/homologacao/00_MIGRACOES_COMPLETAS.sql` **uma vez**, na ordem (001–026, 027, 028). Pré-checagem: `select tgname from pg_trigger where tgrelid='public.transactions'::regclass` deve listar `a0_guard_tx_integrity`, `z_tx_quota`, `z_tx_delete_audit`. Depois: usuários A e B (`seed-homologacao.mjs`) e `select public.seed_homologacao(...)` para cada.
## Etapa 2 — Suítes automatizadas (já escritas)
`npx playwright test tests/homologacao tests/authentication/session-flow.spec.ts` (24 testes de backend + fluxos). Acrescentar, **antes** de liberar: (a) teste de concorrência da cota (usar `evidencias/conc.sh` adaptado com 2+ contas), esperado: nunca > limite; (b) PLAN-01..07 com a correção da cota aplicada.
## Etapa 3 — Testes por módulo (a criar na homologação; regras = as já implementadas)
| Módulo | Casos mínimos | Referência de regra |
|---|---|---|
| Dashboard | totais do mês = soma dos lançamentos; mudança de mês; saldo = Σ contas | regressão `reg.mjs` |
| Receitas/Despesas/Movimentações | criar, editar valor, confirmar (`applied_to_balance`), apagar → saldo volta | REG-01 |
| Contas | criar com saldo inicial, arquivar, saldo por gatilho | REG-01 |
| Cartões/faturas | compra no cartão não altera saldo da conta; fechamento/vencimento; pagar fatura = transferência com `invoice_period`; pagamento antecipado | REG-02 |
| Contas a pagar/receber | vencimento (`due_date`), confirmação manual, atrasados | migrações 007/009/011/012 |
| Transferências | origem−/destino+, não vira receita/despesa | REG-02 |
| Parcelamentos/recorrência | 2–24 parcelas, soma = total (resto na última), cota conta 1, apagar parcela/série | Q2/Q3 |
| Empréstimos | entra/sai do saldo sem virar receita; plano ≥ Plus | REG-03, FEAT-01 |
| Metas | aportes/resgates independentes dos lançamentos | 001/apply_goal_contribution |
| Orçamento/Planejamento | só Pro+; limites por categoria | FEAT-01 |
| Relatórios/Patrimônio | exportação PDF/CSV por plano; números = banco | gates em `plans.ts` |
| Assistente | motor local; Premium | `has_premium_access` |
| Assinatura/Perfil | status, vencimento, cancelamento; usuário não muda plano | PERM-01 |
| Estornos/exclusões | apagar devolve cota e saldo; auditoria registra | Q6 |
Para cada caso: comparar com o resultado de `reg.mjs` (mesma regra) e registrar APROVADO/REPROVADO.
## Etapa 4 — Assinatura e webhooks (Kiwify)
Roteiro com **oferta de teste** (criada por você na Kiwify, valor mínimo/cupom 100%, nunca produto real): 1) configurar `KIWIFY_PRODUCT_*` só no ambiente de homologação (Vercel Preview/projeto à parte); 2) enviar webhook de teste → `verificar-kiwify.mjs`; 3) compra de teste aprovada → plano certo e `paid_until`; 4) reenvio do mesmo evento → sem duplicar; 5) pendente/recusada → sem acesso; 6) renovação; 7) atraso; 8) cancelamento; 9) reembolso/chargeback → revoga; 10) ID desconhecido → dead letter + 500; 11) assinatura inválida → 401; 12) compra antes do cadastro → `billing_pending` aplicada ao cadastrar. Evidência: linhas em `billing_events`/`billing_dead_letters`.
## Etapa 5 — Multi-dispositivo e navegadores
SYNC-01 (2 sessões) + manual em 2 aparelhos; Firefox/WebKit/iPhone real na sua máquina.
## Etapa 6 — Critério de saída
Todos os itens da homologação APROVADO, S-01/S-03/S-04 resolvidos, sem erro de console nas rotas, backup restaurado com sucesso em projeto novo.
