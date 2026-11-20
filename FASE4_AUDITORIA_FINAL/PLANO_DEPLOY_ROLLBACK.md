# Plano de publicação segura e reversão — Money
**Não executado.** Plano para quando você autorizar. Contexto: produção hoje = 001–026 + app/webhook antigos; 2 usuários (vitalícios), 0 pagantes → janela de risco baixa, mas é a hora de ensaiar.

## Risco de versão incompatível
- App novo × banco antigo: o login corrigido funciona com o banco antigo (só lê `profiles`). Webhook novo exige as funções `kiwify_apply_*` (027) — **publicar o webhook antes da 027 faz todo evento pago falhar (500)**. Ordem obrigatória: banco → webhook → app.
- Banco novo × app antigo: o app atual é compatível com 027/028 (séries em um único insert; não envia `created_at`). Webhook antigo continua funcionando com 027 (usa tabelas que não mudaram) — mas troque-o logo.
- 028 nunca sem 027 (S-04) e nunca reaplicar a 027 depois.
## Procedimento
1. **Backup** (pré-requisito): plano com backup; `pg_dump` manual do schema+dados (contas via SQL Editor/CLI) e anotar o valor atual das variáveis a mudar (sem expor).
2. **Validar migrações**: rodar o pacote na homologação; checar gatilhos e rodar a suíte; aplicar a correção da cota (se autorizada) e repetir o teste de concorrência.
3. **Janela**: horário de pouco uso; avisar; congelar mudanças.
4. **Banco**: `027` → verificar → `028` (+ lock da cota) → verificar (`select tgname...`; `select count(*) from transactions` igual ao anterior). Cada migração em transação, uma por vez.
5. **Variáveis (Vercel, só produção)**: `KIWIFY_PRODUCT_START/PLUS/PRO/PREMIUM` (IDs reais conferidos com `verificar-kiwify.mjs`); sem tocar nas demais.
6. **Deploy**: webhook novo + correção de login + (se autorizado) 410 em `billing-subscribe`. Deploy de produção pelo painel/CLI; anotar o ID do deploy anterior (candidatos a rollback hoje: `dpl_HUtUQuHp…` e `dpl_7vXgvKmh…`).
7. **Testes de fumaça (dados fictícios/conta de teste própria)**: abrir `/`, `/login`; login válido; atualizar a página; logout; recuperação de senha; criar 1 lançamento e apagá-lo (cota volta); abrir assinatura; webhook de teste da Kiwify → 200 e linha em `billing_events`; ver `get_runtime_logs` sem 5xx.
8. **Monitoramento (24–72 h)**: logs da Vercel (`/api/kiwify-webhook`), `billing_dead_letters` (deve ficar vazia), Advisors do Supabase, e-mails de erro da Kiwify. Criar alerta simples (consulta diária a `billing_dead_letters`).
## Rollback
- **App/webhook**: Vercel → Deployments → deploy anterior → "Promote/Instant Rollback" (segundos). Reverter variáveis alteradas para os valores anotados.
- **028**: `028_ROLLBACK.sql` (remove gatilho/visão de auditoria; mantém a tabela) e reaplicar o guard da 027. **027**: `027_ROLLBACK.sql`. Ambos testados em cópia (rollback da 027 testado na Fase 2; da 028 só revisado — NÃO EXECUTADO como teste).
- **Dados**: restaurar do backup para um projeto novo e comparar; só depois trocar as chaves do app. Sem backup (hoje) não há como desfazer perda de dados — por isso S-01 bloqueia.
- Critério de reversão imediata: login falhando, 5xx no webhook, cota bloqueando indevidamente, qualquer exposição de dados.
