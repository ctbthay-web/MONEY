# Checklist de lançamento — Money
Classes: APROVADO · APROVADO COM RESSALVAS · REPROVADO · NÃO EXECUTADO · BLOQUEADO. Ambiente simulado/PGlite/local nunca vale "APROVADO" pleno para integração.

| # | Requisito | Classe | Evidência / pendência |
|---|---|---|---|
| **Banco e segurança** |
| 1 | RLS ligado em todas as tabelas | APROVADO | 22/22 em Postgres 16 local com o pacote 001–028; falta conferir o projeto real (BLOQUEADO só p/ a nova versão) |
| 2 | Isolamento A×B | APROVADO COM RESSALVAS | PGlite 11/11; sem Supabase real |
| 3 | Usuário não altera plano/validade/papel | APROVADO | ataques em PG16 real (erro do gatilho) |
| 4 | Funções RPC expostas | APROVADO COM RESSALVAS | admin_* abertas ao anon, protegidas por is_admin (S-07) |
| 5 | SECURITY DEFINER com search_path | APROVADO | 32/32 |
| 6 | Cota com devolução (028) | APROVADO COM RESSALVAS | 39/39 PGlite |
| 7 | Cota sob concorrência | **REPROVADO** | S-03 |
| 8 | Ordem/pré-requisito 027→028 | **REPROVADO** | S-04 |
| 9 | Auditoria de exclusões | APROVADO COM RESSALVAS | só exclusões de usuário; sem snapshot completo da linha |
| 10 | Migrações aplicadas em produção | NÃO EXECUTADO | proibido nesta fase |
| 11 | **Backup / restauração** | **REPROVADO** | Free sem backup (S-01); restauração nunca testada |
| 12 | Senha mínima / leaked password | **REPROVADO** | 6 chars; B-01 |
| **Cobrança** |
| 13 | Webhook novo (lógica, 29+14 testes) | APROVADO COM RESSALVAS | fake db + funções reais; sem Kiwify |
| 14 | Webhook novo em produção | REPROVADO | não publicado; produção roda o antigo (S-02) |
| 15 | IDs reais dos 4 produtos | BLOQUEADO | você fornece |
| 16 | Oferta de teste / compra de teste / reembolso reais | BLOQUEADO | ver PLANO_HOMOLOGACAO |
| 17 | Assinatura vencida bloqueia gravação | APROVADO | PG16: "Seu acesso está encerrado"; leitura permitida |
| 18 | Asaas: conferir painel e desativar | BLOQUEADO | painel externo; autorização |
| 19 | `billing-subscribe` exposto | REPROVADO | S-06 |
| 20 | Referências ao plano PRO legado | APROVADO COM RESSALVAS | 0 usuários vigentes; plano ainda existe em `plans`/código/`Subscription.tsx` |
| **Login e app** |
| 21 | Login/logout/sessão expirada/recuperação/erro de conexão/Tentar novamente/Sair | APROVADO COM RESSALVAS | 13/13 desktop+iPhone emulado, Supabase simulado; correção **não publicada** |
| 22 | Tempo limite do perfil (8 s × 2) | APROVADO COM RESSALVAS | LOGIN-10/12; "sessão expirada" via mock |
| 23 | Sincronização entre dispositivos | NÃO EXECUTADO | SYNC-01 pronto, bloqueado pela homologação |
| 24 | Módulos: dashboard, receitas, despesas, contas, cartões, a pagar/receber, transferências, parcelas, empréstimos, metas, relatórios, patrimônio, assistente, config., perfil | NÃO EXECUTADO (telas) / APROVADO COM RESSALVAS (regras de saldo em PGlite 11/11) | specs de tela são esqueleto; precisa homologação |
| 25 | Cálculos financeiros, faturas, mudança de mês | APROVADO COM RESSALVAS | regressão PGlite; mudança de mês/fuso só no banco |
| **Interface** |
| 26 | Rotas públicas, responsivo (320→1920), PWA, sem erro JS | APROVADO COM RESSALVAS | 123/123 no build local (desktop, Pixel 7, iPhone emulado) — **não** em produção (sandbox sem acesso a vercel.app) |
| 27 | Firefox / WebKit / Safari real | NÃO EXECUTADO | download indisponível aqui: `npx playwright install firefox webkit` e `npx playwright test --project=firefox --project=webkit` |
| 28 | Acessibilidade básica | NÃO EXECUTADO | sugerido `@axe-core/playwright` |
| 29 | Bundle (M-07) | REPROVADO | 1,42 MB / 408 kB gzip num chunk |
| 30 | Headers de segurança (CSP etc.) | APROVADO COM RESSALVAS | presentes em `vercel.json`; verificação ao vivo não executada nesta fase |
| **Infra** |
| 31 | Domínio próprio + HTTPS | REPROVADO/BLOQUEADO | só vercel.app (HTTPS ok); domínio é decisão sua |
| 32 | Logs/monitoramento/alertas | NÃO EXECUTADO | só logs nativos da Vercel; sem alerta de falha de webhook |
| 33 | Deploy e rollback documentados | APROVADO COM RESSALVAS | PLANO_DEPLOY_ROLLBACK; nunca ensaiado |
| 34 | Homologação separada | BLOQUEADO | você cria o Supabase de homologação |
