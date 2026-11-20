# Testes contra Postgres real em memória (PGlite)
O que é: roda as migrações 001–026 (+027) do projeto num motor PostgreSQL real (PGlite/WASM) com stubs mínimos de `auth.uid()` e dos papéis `anon/authenticated/service_role`.
Valida RLS, triggers, cotas, recursos por plano e as funções de cobrança. NÃO valida: PostgREST/Supabase real, Vercel, Kiwify real, rede.
Uso: `npm i @electric-sql/pglite`; ajuste os caminhos (`/mnt/user-data/...`) nos scripts para a sua pasta; `node attack1.mjs` (reproduz a falha ANTES), `node attack3.mjs`, `node attack4.mjs`, `node reg.mjs`, `node webhook-test.mjs`.
