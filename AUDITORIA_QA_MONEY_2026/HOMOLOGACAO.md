# Ambiente de homologação (Supabase separado)
1. Supabase > New project "money-homolog" (região igual à de produção). Não reutilize chaves de produção.
2. SQL Editor: rode `sql/001`…`026` (ou `aplicar_022_a_026.sql` onde couber) e depois `FASE2_CORRECOES/sql/027_fase2_seguranca_cobranca.sql`. (`pg_cron`: opcional.)
3. Copie `homologacao/homologacao.env.exemplo.txt` para `.env.local` e preencha com as chaves do projeto de HOMOLOGAÇÃO. `.env.local` já é ignorado pelo git/Vercel.
4. `node --env-file=.env.local scripts/seed-homologacao.mjs` cria os usuários fictícios A e B (recusa URL de produção e e-mails que não terminam em `.test`; não testado contra Supabase real).
5. `npm run dev` e `E2E_BASE_URL=http://localhost:5173 npx playwright test` (use o mesmo `.env.local`).
6. Webhook em homologação: deploy de Preview na Vercel com variáveis de Preview apontando para o Supabase de homologação e `KIWIFY_WEBHOOK_TOKEN` de teste (diferente do de produção). Nunca configure o webhook de produção da Kiwify para a URL de preview.
7. Cobranças: usar apenas o modo de teste/sandbox da Kiwify; nenhuma cobrança real.
Validar isolamento: os testes `tests/security/rls.spec.ts` (usuários A e B) e `testes-banco/reg.mjs` (já aprovado em Postgres em memória).
