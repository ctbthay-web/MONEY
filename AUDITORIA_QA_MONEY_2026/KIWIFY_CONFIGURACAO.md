# Kiwify — configuração dos IDs reais (sem valores secretos)
**Os 4 IDs reais NÃO foram fornecidos e não estão na Vercel; não inventei nenhum.** O código está pronto para recebê-los.

## Variáveis (só nomes) — situação na Vercel de produção
| Variável | Para que serve | Hoje |
|---|---|---|
| `KIWIFY_PRODUCT_START` / `_PLUS` / `_PRO` / `_PREMIUM` | ID do produto (ou da oferta/plano) da Kiwify de cada plano — **decide o plano liberado** | **NÃO definidas** |
| `KIWIFY_WEBHOOK_TOKEN` | segredo da assinatura HMAC do webhook | definida |
| `SUPABASE_SERVICE_ROLE_KEY` | o webhook grava a assinatura no banco | definida |
| `VITE_KIWIFY_URL_START/PLUS/PRO/PREMIUM` | links de checkout mostrados no app | definidas |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | app → Supabase | definidas |

## Como o webhook decide o plano (atualizado nesta fase)
- **4 IDs preenchidos e diferentes → modo ESTRITO:** só o ID decide. ID desconhecido → o aviso vai para `billing_dead_letters` e responde 500 (a Kiwify reenvia depois que você mapear). **O nome do plano nunca substitui o ID.**
- IDs repetidos entre planos → recusa tudo (configuração inválida).
- IDs incompletos (situação de hoje) → modo transitório: usa o ID quando existe e, na falta, o nome (registrado como `via=name`).
- Nunca decide pelo valor pago.
- O ID configurado pode ser o do **produto** ou o da **oferta/plano da assinatura**; o webhook confere ambos.

## Como obter e conferir cada ID (você)
1. Kiwify → Produtos → cada um dos 4 produtos → copie o ID. (Se os 4 planos forem ofertas de um só produto, use o ID da oferta/plano de cada um.)
2. Para **provar** que cada ID corresponde ao plano certo sem cobrar ninguém: no webhook de teste da Kiwify (ou no histórico de webhooks) copie o JSON de um aviso de cada produto, salve como `start.json`, `plus.json`… e rode `node --env-file=.env.local scripts/verificar-kiwify.mjs start.json plus.json pro.json premium.json`. Ele mostra, para cada arquivo, o plano escolhido e o caminho (`id`/`name`), mascarando os IDs.
3. Só depois cadastre as 4 variáveis na Vercel e faça redeploy. Nada de valor secreto é mostrado pelo script.

## Testes (IDs fictícios; 14/14 + 29/29)
ID→plano para os 4 planos, ID de oferta, ID desconhecido em modo estrito (sem fallback por nome), "nome diz Premium mas ID é Start → Start", IDs duplicados, modo parcial, modo transitório, espaços, e evento pago com ID desconhecido → 500 + dead letter sem liberar acesso. **Integração real com a Kiwify: Não executada** (sem IDs, sem sandbox).
