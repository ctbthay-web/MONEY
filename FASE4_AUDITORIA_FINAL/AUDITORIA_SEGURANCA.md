# Auditoria de Segurança — Money (Fase 4)
Método: leitura das migrações 001–028; carga do pacote num Postgres 16 real local (prelude que replica os papéis/privilégios padrão do Supabase); consultas a `pg_policy`, `pg_proc`, privilégios; ataques de escalonamento; estresse de concorrência; leitura (sem alterar) do painel do Supabase e do Vercel; revisão do código `api/*` e do app.
Limite: **o banco gerenciado do Supabase (PostgREST/GoTrue) e a Kiwify reais não foram exercitados** — o que depende deles está como NÃO EXECUTADO/BLOQUEADO.

| ID | Gravidade | Achado | Impacto | Evidência | Recomendação |
|---|---|---|---|---|---|
| S-01 | **Alta** | Supabase de produção no plano Free: sem backups, sem PITR | Perda irrecuperável de dados financeiros (erro, bug, migração ruim, exclusão) | Painel Database > Backups: "Free Plan does not include project backups" | Plano com backup diário/PITR antes do lançamento; testar restauração em projeto novo |
| S-02 | **Alta (cobrança)** | Webhook Kiwify em produção é a versão antiga | Cliente que paga pode ficar sem acesso (plano não mapeado → 200 e descarta; HMAC sobre JSON re-serializado) | Código em `api/kiwify-webhook.js` do projeto ≠ `FASE3/api` | Publicar a versão nova só após IDs reais + oferta de teste (ver PLANO_DEPLOY) |
| S-03 | Média | Corrida na cota mensal (027/028) | Usuário com requisições paralelas em contas diferentes ultrapassa o limite (27/25 observado) | `evidencias/two.py` (26/25 determinístico), `conc.sh` (4/10 rodadas) | Advisory lock por usuário no gatilho (validado em cópia: 0/15); **aguarda autorização** |
| S-04 | Média | 028 depende da 027 sem trava; reaplicar 027 desfaz a 028 | Proteção de `created_at`/series_id ausente em silêncio | Teste em banco novo: 028 sem 027 → sem gatilho `a0_guard_tx_integrity`; 027 após 028 → guard sem checks novos | Aplicar só o pacote 027→028 em ordem; incluir verificação de pré-requisito na 028 |
| S-05 | Média | Política de senha fraca | Contas fáceis de adivinhar; B-01 | Painel: mínimo 6, sem requisitos, "leaked passwords" off (Pro); Register valida 6 | Mínimo 8+, exigir letras/números; ativar leaked-password quando houver plano Pro |
| S-06 | Média | `billing-subscribe` ativo e órfão | Cobrança real de R$ 12,90 (preço não oficial); sobrescreve `billing_provider` de assinante Kiwify | Código `api/billing-subscribe.js`; `ASAAS_*` presentes na Vercel | Responder 410 e remover após conferir o painel do Asaas |
| S-07 | Baixa | 38 avisos do Security Advisor (0 erros) | Funções DEFINER executáveis por `anon` (incl. `admin_set_user_role`, `admin_run_*`); `set_updated_at`/`month_start_brt` sem search_path | Painel Advisors; confirmado em `has_function_privilege` | `revoke execute ... from anon, public` nas administrativas; fixar search_path |
| S-08 | Baixa (privacidade) | Papel `admin` lê contas/lançamentos/perfis de todos | Acesso amplo a dados financeiros de clientes | Políticas `is_admin()` em accounts/transactions/profiles | Definir política de acesso, auditar uso; hoje 0 admins |
| S-09 | Baixa | Provedor GitHub habilitado sem uso | Superfície de ataque desnecessária | Painel Auth > Providers; sem `signInWithOAuth` no código | Desabilitar |
| S-10 | Baixa | Webhook Asaas: token comparado sem tempo constante; erros de escrita não verificados | Inativo na prática (0 assinantes), mas endpoint vivo | `api/billing-webhook.js` | Remover com o Asaas |
| S-11 | Info | Retenção apaga histórico (Start/Plus 6 meses, Pro 24, Premium sem limite) e não gera auditoria | Perda de relatórios antigos por plano; rastreabilidade só das exclusões do usuário | `023_budgets_retention.sql`, cron mensal | Comunicar no site/plano; decidir se mantém |
| S-12 | Info | Sem domínio próprio; deploys sem git | Menos profissional/rastreável; rollback depende do painel | Vercel: só `*.vercel.app`; `meta` vazia | Domínio + deploy por git |

## Verificado como seguro (com evidência)
RLS 22/22 tabelas · policies por `auth.uid()` · cobrança/auditoria negadas a usuários (permission denied estrito) · sem escalonamento: role/plan/paid_until/is_lifetime protegidos por gatilho · `admin_set_user_role` recusa não-admin · inserir em `plans`/categoria global bloqueado · acesso expirado não grava (lê) · 32/32 funções DEFINER com search_path · e-mail de confirmação ligado · chaves secretas: apenas nomes vistos na Vercel, nenhum valor lido.
## Não verificado
Rate limiting real do Auth, templates de e-mail, URL de redirecionamento do Auth, políticas de Storage (não há uso), CORS do PostgREST, resposta do Supabase a JWT expirado em produção.
