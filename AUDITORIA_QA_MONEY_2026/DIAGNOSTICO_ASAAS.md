# Diagnóstico do Asaas (somente leitura — nada foi removido ou desativado)
**Referências no código:** `api/_lib/billing.js` (cliente Asaas, `PLAN_VALUE = 12.9`), `api/billing-subscribe.js` (cria cliente + assinatura R$ 12,90 no Asaas), `api/billing-cancel.js` (cancela assinatura no Asaas), `api/billing-webhook.js` (recebe avisos do Asaas), `src/pages/Subscription.tsx` (botão de cancelar aparece só se `billing_provider='asaas'`), SQL 019/020 (colunas `billing_*`, plano legado `pro` R$ 12,90, `billing_events`).
**Variáveis na Vercel (produção) — só nomes:** `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` → a integração está ativa.
**Descobertas:**
- `billing-subscribe` NÃO é chamado por nenhuma tela atual (só o cancelamento é): é um endpoint órfão, ainda exposto a qualquer usuário logado, que pode gerar cobrança real de R$ 12,90 no Asaas (informando CPF/CNPJ).
- O webhook do Asaas tem o mesmo defeito da ALTA-03 (grava o evento antes de atualizar o perfil e não confere o erro) e compara o token sem tempo constante.
- Quem está no plano legado `pro` tem tudo liberado e sem limite (`effectivePlan = 'all'`): remover o plano `pro` ou as colunas quebraria esses acessos.
- A cobrança recorrente é feita pelo Asaas: desativar o webhook/cancelamento sem migrar os assinantes interromperia renovações.
**Consultas somente-leitura para você rodar no SQL Editor do Supabase (produção):**
```sql
select billing_provider, billing_status, count(*) from profiles where billing_provider is not null group by 1,2;
select count(*) as legado_pro_ativos from profiles where plan_id='pro' and paid_until > now();
select count(*) as eventos_asaas from billing_events where payment_id not like 'kiwify:%';
```
**Recomendação em etapas (aguarda sua autorização):** (1) rodar as consultas; (2) se não houver assinantes Asaas ativos: responder 410 em `billing-subscribe` e remover as variáveis ASAAS_*; (3) se houver: manter webhook e cancelamento até o fim do ciclo, aplicar o mesmo padrão atômico, e migrar para a Kiwify; (4) só então remover código/tabelas.
