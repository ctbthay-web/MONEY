# Como aplicar a Fase 2 (nada foi aplicado em produção)
Esta pasta é a "branch" (o projeto não é um repositório git; os arquivos originais estão intactos).
Backup/reversão: antes de qualquer passo, faça backup do banco (Supabase > Database > Backups) e copie `api/kiwify-webhook.js`.
1. **Homologação primeiro** (ver `homologacao/`): rode `sql/027_fase2_seguranca_cobranca.sql` no Supabase de HOMOLOGAÇÃO; depois a suíte (`npx playwright test`) com os usuários A e B.
2. Webhook: copie `api/kiwify-webhook.js` para `api/` (mantém `api/_lib/billing.js`). Faça deploy de PREVIEW e dispare eventos de teste da Kiwify.
3. Só então, com sua autorização, repita a 027 em produção (leva segundos; não altera dados) e faça o deploy de produção.
4. Reversão: `sql/027_ROLLBACK.sql` e restaurar o `kiwify-webhook.js` anterior.
5. `027b_OPCIONAL_cota_sem_estorno.sql`: SÓ com sua decisão (apagar lançamento deixa de devolver cota).
6. `src/features/auth/AuthProvider.tsx` é PROPOSTA não testada (precisa de build + teste no app).
7. Variáveis a conferir na Vercel (produção): `KIWIFY_PRODUCT_START/PLUS/PRO/PREMIUM` NÃO estão definidas — o plano é identificado pelo nome do plano/produto na Kiwify. Recomenda-se preencher com os IDs reais dos produtos.
`testes-banco/`: scripts que reproduzem os testes contra o Postgres em memória (ver README lá).
