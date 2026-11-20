# Relatório de Auditoria Final — Money (Fase 4)
Data: 12/11/2026 · Modo: **somente auditoria** (nenhum código, banco, variável, preço, plano, assinatura ou deploy foi alterado; produção só recebeu SELECTs e leituras de painel).

## 1. Resultado geral
**O Money NÃO está pronto para lançamento comercial.** A base de segurança do banco é boa (RLS ligado nas 22 tabelas, sem escalonamento de privilégio nos testes), mas há bloqueios reais: (1) **o que corrige cobrança, login e cota não está em produção** — está só na pasta FASE3; (2) **o Supabase de produção está no plano Free, sem backup**; (3) **corrida na cota** reproduzida; (4) **nenhum teste contra Supabase/Kiwify reais foi feito**; (5) IDs da Kiwify e domínio próprio ausentes.

## 2. O que está implementado × planejado (comparado com o código atual do projeto)
| Item | Situação real |
|---|---|
| Migrações 001–026 | Em produção (anterior). |
| 027, 028, webhook Kiwify novo, correção de login | **Só em `FASE3/` — não aplicados nem publicados.** `src/features/auth/AuthProvider.tsx` e `api/kiwify-webhook.js` do projeto são os originais (confirmado na pasta do seu computador: AuthProvider original de 2.235 bytes). |
| Webhook Kiwify em produção | **Versão antiga**: assinatura sobre `JSON.stringify` do corpo (pode rejeitar avisos legítimos), plano não identificado responde 200 e é descartado (cliente paga e fica sem acesso, sem nova tentativa), sem dead letter. |
| Asaas | Código ainda ativo (`billing-subscribe/cancel/webhook`, `PLAN_VALUE=12.9`), variáveis `ASAAS_*` na Vercel. |
| Testes | Banco: motor Postgres (PGlite) e, nesta fase, Postgres 16 real local. Telas: Supabase simulado. **Nenhum contra Supabase gerenciado/Kiwify real.** |

## 3. Achados novos desta fase (todos reproduzidos ou verificados)
1. **ALTO — sem backup**: painel do Supabase de produção: "Free Plan does not include project backups". Sem PITR. Perda de dados financeiros de clientes seria irrecuperável.
2. **ALTO (cobrança) — webhook em produção é o antigo** (acima). Enquanto não for publicado + IDs configurados, uma compra real pode não liberar acesso.
3. **MÉDIO — corrida na cota (027/028)**: duas transações em **contas diferentes** passam na checagem antes de qualquer commit e a cota estoura (26/25 determinístico; 4 de 10 rodadas com 40 inserções paralelas, máx. 27). Em mesma conta o bloqueio de linha do saldo serializa e mascara o problema. Correção validada em cópia isolada (advisory lock): 0/15. `evidencias/CORRECAO_PROPOSTA_cota_lock.sql`. **Não aplicada.**
4. **MÉDIO — ordem/dependência das migrações**: a 028 aplicada sem a 027 roda sem erro mas **não cria o gatilho `a0_guard_tx_integrity`** (testado) — created_at forjado volta a funcionar; e reaplicar a 027 depois da 028 **desfaz** as verificações novas do guard (testado). Use só o pacote na ordem 027→028; recomenda-se trava de pré-requisito.
5. **MÉDIO — senha**: mínimo 6, sem requisitos de complexidade e "leaked password protection" desligada (só no plano Pro) — B-01 **confirmado**. O cadastro também valida só 6.
6. **MÉDIO — `billing-subscribe` órfão**: com `ASAAS_*` configuradas, qualquer usuário logado pode criar cliente+assinatura real de R$ 12,90 no Asaas (preço fora dos 4 oficiais) e **sobrescreve `billing_provider='asaas'`** mesmo para assinante da Kiwify.
7. **BAIXO — advisor do Supabase**: 0 erros, **38 avisos** (funções SECURITY DEFINER executáveis por anon, incl. `admin_*` — protegidas por `is_admin()` internamente; `set_updated_at`/`month_start_brt` sem search_path). Confirmado também localmente: `admin_*`, `is_admin` abertos ao anon.
8. **BAIXO/PRIVACIDADE — admin lê tudo**: políticas `is_admin()` dão SELECT em contas, lançamentos e perfis de todos. Hoje 0 admins; decidir política (LGPD) antes de contratar suporte.
9. **BAIXO — provedor GitHub habilitado** no Supabase Auth sem uso no app (superfície à toa).
10. **INFO — infraestrutura**: só domínio `*.vercel.app` (sem domínio próprio); deploys manuais (sem commit/branch nos metadados); 2 deploys marcados como candidatos a rollback; 1 único erro de runtime em 7 dias (aviso de depreciação no kiwify-webhook).
11. **INFO — bundle**: chunk principal 1,42 MB (408 kB gzip), sem divisão por rota (M-07 confirmado); jsPDF/html2canvas já em chunks separados.
12. **Qualidade dos testes**: o teste ISO-02 da Fase 3 aceitava "qualquer erro" como acesso negado (passou até para tabela inexistente). Reverifiquei com checagem estrita (permission denied) nas 5 tabelas/visões sensíveis: OK. Alguns testes (Q4f, Q7b) têm desfecho condicional — fracos por construção, ver CHECKLIST.

## 4. O que foi verificado e está sólido (evidência)
- RLS ligado em 22/22 tabelas; políticas por `auth.uid()`; tabelas de cobrança e auditoria sem acesso para anon/authenticated (permission denied).
- Usuário **não** consegue: virar admin, mudar plano/validade/vitalício, chamar funções de cobrança, inserir em `plans`, criar categoria global, ler perfil alheio, gravar com acesso expirado (leitura continua permitida).
- Todas as 32 funções SECURITY DEFINER (de 36 no schema public) têm `search_path` fixo (conferido em `pg_proc`); as 2 que o advisor aponta são funções comuns (INVOKER).
- Regressão financeira 11/11 e isolamento A×B (PGlite); cota: 39/39 cenários (PGlite) + corrida em Postgres real (falha — achado 3).
- Login: 13/13 em desktop e iPhone emulado (Supabase simulado); suíte pública 123/123 (desktop, Pixel 7, iPhone emulado) contra o **build local** — não contra produção (o ambiente de execução não alcança `vercel.app`; não contornei).
- Segurança do cliente: o assistente financeiro é motor local (nenhum dado sai para IA externa).

## 5. Recomendações (em ordem)
1. Passar o Supabase para plano com backup/PITR **antes** de qualquer cliente real. 2. Criar a homologação e rodar a suíte real. 3. Aplicar correção da cota (lock) + trava de pré-requisito da 028 (com sua autorização). 4. Publicar webhook novo só após IDs reais + oferta de teste. 5. Desativar `billing-subscribe` (410) e decidir o Asaas após conferir o painel dele. 6. Subir senha mínima (8+) e requisitos. 7. Revogar EXECUTE de anon nas funções administrativas. 8. Domínio próprio + deploy via git. 9. Dividir o bundle por rota.

## 6. Tabela de cenários da cota (regra: lançamentos existentes no mês; série conta 1; apagar devolve)
Motor: **PGlite** (Postgres em WASM, teste `testes-banco/q028.mjs`, 39 verificações) salvo onde indicado **PG16 real**. Nenhum é Supabase gerenciado → "APROVADO COM RESSALVAS" quando a lógica passou.
| # | Cenário | Esperado | Encontrado | Evidência | Classe |
|---|---|---|---|---|---|
| 1 | 25 avulsos no Start, 26º | bloqueia | bloqueou | Q1a/b | APROVADO COM RESSALVAS |
| 2 | Apagar 1 avulso e criar outro | devolve 1 | devolveu | Q1c/d/e | APROVADO COM RESSALVAS |
| 3 | Parcelamento de 10 | conta 1 | 1 (10 linhas) | Q2a | APROVADO COM RESSALVAS |
| 4 | Apagar 3 de 10 parcelas | não devolve | não devolveu | Q2b | APROVADO COM RESSALVAS |
| 5 | Apagar série inteira | devolve 1 | devolveu 1 | Q2c | APROVADO COM RESSALVAS |
| 6 | 2 séries + 2 avulsos | 4 | 4; `tx_usage()` igual | Q3a/b | APROVADO COM RESSALVAS |
| 7 | Séries diferentes confundidas | não | `series_id` = id de outro lançamento é recusado (028); na 027 sozinha **era possível** | Q4a, q028-brecha | APROVADO COM RESSALVAS (só com 028) |
| 8 | Manipular `created_at` / `series_id` / `id` | recusa | recusado | Q4b–f | APROVADO COM RESSALVAS |
| 9 | Inserir em nome/conta de outro | recusa | recusado | Q4g, ISO-03 | APROVADO COM RESSALVAS |
| 10 | Apagar lançamento de mês anterior | não devolve cota atual | não devolveu | Q5 | APROVADO COM RESSALVAS |
| 11 | **Duas operações simultâneas** (contas diferentes) | não ultrapassa | **ultrapassou: 26/25 e até 27/25** | PG16 real: `two.py`, `conc.sh` | **REPROVADO** |
| 12 | Mesmas operações na mesma conta | não ultrapassa | não ultrapassou (lock de linha do saldo) | PG16 real, 12×40 | APROVADO COM RESSALVAS (mascara o risco) |
| 13 | Apagar e recriar para contornar | ≤ N vivos; decisão do proprietário | nunca > 25 vivos em 3 ciclos; 75 cotas devolvidas no relatório | Q9 | APROVADO COM RESSALVAS (regra aceita; sem limite de exclusões, como pedido) |
| 14 | Auditoria de exclusões: registra, usuário não lê/altera/apaga/forja | sim | sim; exclusão do servidor (cron) não registra | Q6, Q7a; permission denied em PG16 | APROVADO COM RESSALVAS |
| 15 | Exclusão física × relatórios/rastreabilidade | documentar | sem exclusão lógica; auditoria guarda id/valor/série/quem/quando; **sem descrição/categoria** e sem cópia da linha | Q11, `tx_deletion_audit` | APROVADO COM RESSALVAS |
| 16 | 028 sem a 027 / ordem trocada | proteção completa | **gatilho de integridade ausente / checks desfeitos** | PG16 real, banco novo | **REPROVADO** (risco de implantação) |
| 17 | Compatibilidade com o app atual | séries em 1 lote | o app insere a série num único `insert` com UUID de cliente → compatível; excluir no app é parcela a parcela (`delete eq id`) | leitura de `useTransactions.ts` | APROVADO COM RESSALVAS (leitura de código; sem teste de tela real) |
| 18 | Coerência banco × interface (contador na tela) | mesmo número | `tx_usage()` bate no banco; coerência na tela **não testada** | — | NÃO EXECUTADO |
| 19 | 027 necessária? | sim | 027 cria o guard e os gatilhos que a 028 só altera/complementa; 028 não substitui a 027 | leitura + teste 16 | APROVADO |
