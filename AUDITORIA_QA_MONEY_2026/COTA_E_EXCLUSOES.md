# Cota mensal de lançamentos — como funciona, exclusões e auditoria (Fase 3 §1)

**Decisão do dono do produto:** apagar um lançamento devolve a cota. A migração `028` implementa isso. A `027b` (cota "sem estorno") **não deve ser usada** — ela fazia o contrário.
**Status:** pronta e validada em banco PGlite (39/39). **NÃO aplicada em produção.**

## Como a contagem funciona (regra única, no banco)
`usado(mês) = número de chaves distintas entre as linhas de transactions do usuário com created_at no mês (fuso de Brasília)`.
A chave é o `series_id` (parcelamento/recorrência) ou, se avulso, o próprio `id`. Como só se contam linhas que **existem**, apagar devolve.

| Situação | Efeito na cota |
|---|---|
| Lançamento avulso criado | +1 |
| Parcelamento/recorrência (2 a 24 ocorrências) criado | +1 (a série inteira conta 1) |
| Avulso apagado | −1 |
| Série apagada por inteiro | −1 (não −N) |
| Parte das parcelas apagada | 0 (a série ainda existe) |
| Lançamento de mês anterior apagado | 0 neste mês (o created_at é de outro mês) |
| Conta apagada (cascata) | devolve o que as linhas apagadas contavam |

Limites (sql/022): Start 25, Plus 50, Pro 70, Premium ilimitado. Plano e período são lidos no momento da inserção; mudar de plano muda o teto na hora.

## Exclusão física × lógica
Verificado: `transactions` **não tem** coluna de exclusão lógica (deleted_at/is_deleted). Toda exclusão é `DELETE` físico (teste Q11). Contas são "arquivadas" por flag, não apagadas pelo app; se apagadas, os lançamentos saem em cascata (cobertos por Q7b). A limpeza de retenção (cron) apaga só linhas antigas e não entra na auditoria de ações do usuário.

## Parcelamentos, recorrências e contagem dupla
Testado: 2 séries + 2 avulsos = 4 usados (32 linhas); `tx_usage()` informa o mesmo número ao app (Q3).

## Manipulação — o que o usuário tenta e o que acontece
- `created_at` forjado no insert → ignorado (vira o horário do servidor); alterar depois → recusado.
- `series_id` repetido entre lotes → recusado; limite de 60 por série.
- **Brecha nova achada nesta fase:** `series_id` igual ao `id` de OUTRO lançamento fazia dois lançamentos contarem 1. Reproduzida contra a 027 sozinha ("2 linhas, cota 1") e **fechada na 028** (também: id novo igual a series_id existente, e troca de id por update).
- Inserir em nome de outro usuário / conta alheia → recusado (RLS + ownership).

## Auditoria de exclusões
Tabela `tx_deletion_audit` (gatilho `z_tx_delete_audit`): para cada exclusão feita por usuário logado grava id, usuário, série, tipo, valor, data de criação, data da exclusão, **quem apagou**, se contava no mês, quantas linhas da mesma chave restaram, se a cota foi devolvida e o uso do mês após a exclusão. O usuário **não lê, não altera, não apaga nem forja** registros (testes Q6e–h). Exclusões feitas pelo servidor (cron de retenção, service role) não entram. Para uma série apagada em lote, cada linha aparece; use `quota_key` para contar a cota uma vez (a visão `tx_churn_report` já faz isso).

## Risco residual (decisão sua, honesta)
Com devolução, o usuário pode "apagar e recriar": nos testes, 3 ciclos de 25 criar/apagar nunca passaram de **25 lançamentos vivos** (Q9a) — ou seja, o teto real passa a ser "N lançamentos existentes no mês", não "N criados". Isso é coerente com a sua decisão, mas gera carga e permite usar o plano Start como "bloco de rascunho". A visão `tx_churn_report` mostra quem faz isso (no teste: 75 cotas devolvidas). Se quiser restringir depois, a opção é um teto de exclusões/mês — **não implementado; só com sua decisão**.

## Como aplicar (quando decidir)
Homologação primeiro: `00_MIGRACOES_COMPLETAS.sql` já inclui 027+028. Em produção (já tem 001–026): rodar `027` e depois `028`. Reversão: `028_ROLLBACK.sql` e `027_ROLLBACK.sql`.
