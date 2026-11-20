# Checklist de homologação — Money (Fase 3)
Legenda: **Aprovado** = executado de verdade e passou · **Reprovado** · **Não executado** · **Bloqueado por dependência externa**.
Testes contra mock/PGlite são **simulados**: valem para a lógica testada, **não** como integração real.

| # | Item | Status | Evidência / observação |
|---|---|---|---|
| 1 | Cota mensal com devolução ao apagar (028) | **Aprovado** (banco simulado PGlite) | 39/39; não aplicada em produção; falta rodar no Supabase real |
| 2 | Brecha series_id = id alheio | **Aprovado** (corrigida na 028, reproduzida antes) | q028-brecha + Q4a/b |
| 3 | Auditoria de exclusões | **Aprovado** (PGlite) | Q6, Q7 |
| 4 | Exclusão lógica | **Aprovado** (não existe; só DELETE físico) | Q11 |
| 5 | Webhook Kiwify: assinatura, idempotência, falha→500 | **Aprovado** (lógica, 29/29 simulados) | sem Kiwify real |
| 6 | Mapeamento por ID real dos 4 produtos | **Bloqueado por dependência externa** | IDs reais não fornecidos; lógica testada com IDs fictícios (14/14) |
| 7 | Integração real Kiwify (compra de teste, reembolso) | **Bloqueado por dependência externa** | exige IDs, sandbox/produto de teste |
| 8 | Asaas: consultas em produção (somente leitura) | **Aprovado** | 0 perfis/assinantes/eventos Asaas |
| 9 | Asaas: assinaturas/webhook no painel do Asaas | **Bloqueado por dependência externa** | sem acesso ao painel |
| 10 | Asaas: desativação | **Não executado** | aguarda sua autorização |
| 11 | Login: válido / inválido / sessão / expirada / logout / refresh / recuperação / erro de conexão / perfil lento ou 500 / tentar novamente | **Aprovado** (13/13, mock; desktop + iPhone emulado) | não é backend real |
| 12 | Login corrigido em produção | **Não executado** | precisa de deploy e teste no celular |
| 13 | Pacote de migrações 001–028 carrega | **Aprovado** (PGlite) | no Supabase real: Não executado |
| 14 | Supabase de homologação criado | **Bloqueado por dependência externa** | você cria |
| 15 | Seed fictício A/B | **Aprovado** (PGlite, 8/8) | no real: Não executado |
| 16 | Isolamento A×B (11 tabelas) | **Aprovado** (PGlite) | no real: Bloqueado (api-backend.spec.ts pronto) |
| 17 | Autenticação real (Supabase Auth) | **Bloqueado por dependência externa** | AUTH-01..06 prontos |
| 18 | Permissões (perfil, funções de cobrança, tabelas) | **Aprovado** (PGlite) / real: **Bloqueado** | PERM-01..03 |
| 19 | Limites de plano e recursos por plano | **Aprovado** (PGlite) / real: **Bloqueado** | PLAN, FEAT |
| 20 | Regressão financeira (saldos, transferência, cartão, empréstimo) | **Aprovado** (PGlite, 11/11) | antes×depois idênticos |
| 21 | Playwright público (rotas, PWA, headers, desempenho, responsivo) | **Aprovado** (rodada 1, Chromium) | produção, só leitura |
| 22 | Playwright autenticado: cadastro, dashboard, lançamentos, contas, cartões, faturas, empréstimos, orçamento, metas, relatórios, assistente, assinatura | **Bloqueado por dependência externa** | specs-esqueleto `fixme`; precisa de homologação + seletores confirmados |
| 23 | Sincronização entre dispositivos (banco) | **Bloqueado** (SYNC-01 pronto) | pela tela: Não executado |
| 24 | Firefox | **Não executado** | download do navegador indisponível aqui; rode na sua máquina |
| 25 | WebKit/Safari real | **Não executado** | idem |
| 26 | iPhone | Emulado em Chromium: **Aprovado** só p/ login; real: **Não executado** | |
| 27 | Segurança de headers/segredos | **Aprovado** (rodada 1) | CSP etc. já no vercel.json |
| 28 | Preços comerciais | **Não alterados** | conforme regra |
| 29 | Produção alterada / cobrança real / dados reais apagados | **Nenhum** | só SELECTs |
