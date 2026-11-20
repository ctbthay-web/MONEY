# Asaas — consultas em produção (somente leitura) e plano de desativação
**Nada foi desativado, alterado ou removido.** Rodei apenas SELECTs no SQL Editor do Supabase de produção, com a sua sessão.

## Resultado observado (produção, hoje)
| Consulta | Resultado |
|---|---|
| Perfis com `billing_provider` preenchido (por provedor/status) | **0** |
| Plano legado `pro` com `paid_until` vigente | **0** |
| Eventos em `billing_events` que não são da Kiwify | **0** (a tabela inteira tem 0 eventos) |
| Distribuição de planos | 2 perfis: plano `free`, os 2 vitalícios, 0 pagantes, 0 admins |

## O que isso significa
Não há cliente, assinatura nem evento do Asaas registrado **no nosso banco**. Isso **não prova** que não exista assinatura no painel do Asaas (ali eu não tenho acesso): confira no painel do Asaas se há clientes/assinaturas/cobranças ativas e qual URL de webhook está cadastrada.

## Antes de desativar — o que você precisa saber
- **Dependências no código:** `api/_lib/billing.js` (cliente Asaas), `billing-subscribe.js` (órfão: nenhuma tela chama, mas está exposto a qualquer usuário logado e cria cobrança real de R$ 12,90), `billing-cancel.js` (a tela só chama se `billing_provider==='asaas'`, hoje ninguém), `billing-webhook.js` (webhook Asaas; defeitos da ALTA-03).
- **Variáveis na Vercel:** `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`.
- **Clientes/assinaturas vinculados no banco:** nenhum (acima).
- **Webhooks ativos:** não verificável daqui (painel do Asaas).
- **Plano legado `pro` (R$ 12,90):** 0 usuários vigentes; mesmo assim não remover a linha de `plans` nesta etapa (o app e a 022 ainda a referenciam).

## Riscos da desativação
1. Se houver assinatura viva só no painel do Asaas, ela continuaria cobrando sem liberar/atualizar acesso → cancele lá antes.
2. Remover o endpoint `billing-cancel` sem necessidade impede cancelar no futuro; sem assinantes Asaas, o risco é baixo.
3. Remover as variáveis antes do código quebra o build/deploy dos endpoints que as leem (retorna 503 — comportamento seguro).

## Passos propostos (precisam da sua autorização, um por vez)
1. Você confere o painel do Asaas (assinaturas ativas, webhook cadastrado). 2. `billing-subscribe` passa a responder 410 (some a superfície de cobrança indevida) — mudança de código, vai por deploy normal. 3. Desabilitar o webhook no Asaas. 4. Remover `ASAAS_*` da Vercel. 5. Só depois, remover código e o plano `pro`.
## Rollback
Passos 2–5 são reversíveis: reverter o commit/deploy anterior na Vercel (instant rollback), recriar as 3 variáveis (anote os valores antes de remover) e reativar o webhook no Asaas. Nada nesta fase altera dados.
