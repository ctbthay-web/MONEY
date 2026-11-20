# Preços e planos — onde cada valor é definido (nada foi alterado)
| Local | Start | Plus | Pro | Premium |
|---|---|---|---|---|
| Frontend `src/lib/plans.ts` — mensalidade | R$ 19,90 | R$ 29,90 | R$ 39,90 | R$ 59,90 |
| Frontend — 1ª cobrança promocional | R$ 9,90 | R$ 19,90 | R$ 29,90 | R$ 39,90 |
| Frontend — limite de lançamentos/mês | 25 | 50 | 70 | sem limite |
| Banco `plans.price_cents` (sql/022) | 1990 | 2990 | 3990 | 5990 |
| Banco `plans.limits` (sql/022) | 25 | 50 | 70 | {} |
| CLAUDE.md (documentação) | 19,90 / 25 | 29,90 / 50 | 39,90 / 70 | 59,90 / ilimitado |
| Kiwify (checkout `VITE_KIWIFY_URL_*` na Vercel) | **não verificável daqui** | idem | idem | idem |
| Webhook Kiwify | não usa valor: o plano é deduzido do ID do produto (env, hoje vazio) ou do nome do plano/produto | | | |
Itens legados: plano `pro` "Money Mensal" R$ 12,90 (sql/019; acesso total), `PLAN_VALUE = 12.9` no Asaas, e CLAUDE.md linha 40 ainda descreve R$ 12,90 + teste de 7 dias (desatualizado: a migração 024 removeu o teste).
Observações: `plans.price_cents` é só informativo (nenhuma regra usa o valor); a 1ª cobrança promocional existe só no front e na Kiwify; os limites existem em dois lugares (front e banco) — a regra que vale é a do banco.
**Decisão necessária:** conferir na Kiwify o valor de cada oferta e informar a tabela comercial oficial; só então ajusto qualquer divergência.
