# Auditoria de segurança (estática + testes públicos)
Positivos: RLS por linha; `a0_check_ownership` impede referenciar contas/categorias de terceiros; `protect_profile_privileged_columns` bloqueia o usuário de alterar plano/acesso; paywall `a00_paywall`/`has_access()`; tabelas de billing sem policies; `find_user_id_by_email` só service role; webhook Kiwify exige assinatura; nenhum segredo no bundle (SEC-01 OK); `.env` no `.gitignore`.
Riscos: ver ALTA-01..03, M-03, M-05, M-06, B-01, B-02, B-04.
Não executado: teste de RLS com 2 usuários (`tests/security/rls.spec.ts` descreve), IDOR real, rate limit, headers de segurança em produção (CSP/HSTS — recomendável configurar em `vercel.json`), XSS em campos de texto, SQL injection (API via PostgREST parametrizada; baixo risco).
