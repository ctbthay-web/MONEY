# Configuração do banco (Supabase)

1. Crie um projeto gratuito em https://supabase.com.
2. Em **Project Settings → API**, copie a `Project URL` e a `anon public key`.
3. Cole esses valores em um arquivo `.env` na raiz do projeto (copie de `.env.example`).
4. No painel do Supabase, abra **SQL Editor** e rode os arquivos **nesta ordem**, um de cada vez:
   1. `001_schema.sql`
   2. `002_functions_triggers.sql`
   3. `003_rls.sql`
   4. `004_seed.sql`
   5. `005_retention_cron.sql` — **opcional**. Só funciona se a extensão `pg_cron` estiver habilitada em Database → Extensions. Sem isso, a limpeza de retenção pode ser disparada manualmente pela área administrativa do app (botão "Executar limpeza").
   6. `006_recurrence_installments.sql`
   7. `007_due_date_balance.sql`
   8. `008_cards_transfers_loans.sql`
   9. `009_manual_confirmation.sql` — remove a aplicação automática por data: nenhuma movimentação/transferência futura entra no saldo sozinha, só quando o usuário confirmar manualmente que pagou/recebeu.
   10. `010_loan_due_date.sql` — adiciona `due_date` (opcional) em `loans`, para registrar até quando espera a devolução de um empréstimo.
   11. `011_transaction_due_date.sql` — adiciona `due_date` (opcional) em `transactions`, separado da `date`: "Data" é quando a movimentação foi registrada, "Vencimento" é quando ela vence de fato.
   12. `012_due_date_confirm.sql` — ajusta o trigger de saldo para confirmar sozinho no INSERT usando `due_date` quando preenchido (senão `date`, como antes) — sem isso, lançar hoje algo com vencimento futuro ficava marcado como pago na hora.
   13. `013_loan_update.sql` — permite editar empréstimo (valor/conta/tipo) ajustando o saldo (desfaz efeito antigo + pagamentos, aplica o novo) e corrige a exclusão de empréstimo com pagamentos (trigger BEFORE DELETE).
   14. `014_fix_series_due_date.sql` — conserta séries criadas com o mesmo vencimento em todas as parcelas (o vencimento passa a acompanhar cada parcela).
   15. `015_retention_keeps_balance.sql` — a limpeza de retenção não mexe mais no saldo das contas (antes o DELETE revertia o saldo das movimentações antigas) e as funções internas de manutenção deixam de ser chamáveis por usuários comuns via RPC.
   16. `016_retention_keeps_unpaid.sql` — a limpeza de retenção só apaga o que já foi quitado (conta comum: confirmado; cartão: fatura paga); movimentações ainda não pagas são preservadas mesmo com mais de 6 meses.
   17. `017_protect_profile_columns.sql` — SEGURANÇA: impede que usuário comum altere `role`/plano/`is_active` do próprio perfil (antes qualquer um podia se promover a admin).
   18. `018_ownership_checks.sql` — SEGURANÇA: antes de gravar movimentação/transferência/empréstimo/pagamento/aporte, confirma que a conta/meta/empréstimo/categoria referenciados pertencem ao mesmo usuário (antes dava para mexer no saldo de outra pessoa).
   19. `019_subscription_access.sql` — assinatura mensal (R$ 12,90) com teste grátis de 7 dias: colunas `is_lifetime`/`paid_until`/`billing_*` em `profiles`, `has_access()`, trigger `a00_paywall` (sem acesso o banco recusa gravar; ler continua), vitalícios (ctbthay@ e guigomes021@) e teste de 7 dias no cadastro.
   20. `020_billing_events.sql` — tabela `billing_events` (pagamentos do Asaas já processados; garante que o mesmo pagamento não estende o acesso duas vezes). Só o servidor acessa.
   21. `021_notifications.sql` — notificações push: `notification_preferences` (sem linha = tudo ativado), `push_subscriptions`, `notification_schedules` (programações do usuário) e `notification_log` (histórico + anti-duplicidade). RLS por usuário. O envio é feito por `/api/notify-run` (ver CLAUDE.md).
   22. `022_plans_kiwify.sql` — planos Start/Plus/Pro/Premium: limite de lançamentos por mês aplicado no banco, `tx_usage()`, `billing_pending` (compra na Kiwify antes de criar a conta) e `find_user_id_by_email()` (só service role).
   23. `023_budgets_retention.sql` — tabela `budgets` (orçamento por categoria, com RLS, paywall e checagem de dono), `notify_budgets` e retenção por plano (6 meses; 24 no Pro; Premium/vitalício/admin nunca apagam). Rodar depois da 022.
   24. `024_no_trial.sql` — acaba com o teste grátis de 7 dias para cadastros novos (nascem sem acesso até assinar). Rodar depois da 022.
   25. `025_agent_name.sql` — `profiles.agent_name` (nome da assistente, plano Premium): validação no banco (2-20 caracteres, só letras/espaço/ponto/hífen/apóstrofo) e trigger que só deixa gravar quem tem direito ao recurso (`has_premium_access()`). Rodar depois da 024.
   26. `026_assistant_history.sql` — `ai_conversations` e `ai_messages` (histórico individual da assistente, Premium): RLS por usuário, mensagem só em conversa própria, limites (200 conversas, 500 mensagens por conversa, 4.000 caracteres) e trava de Premium no banco. Rodar depois da 025.
   27. `027_invoice_closing_day.sql` — regra do fechamento: compra NO dia do fechamento (ou depois) cai na fatura seguinte; só reescreve `cleanup_old_transactions` para concordar com `src/lib/invoices.ts`. Rodar depois da 026.
   28. `028_loan_payment_account.sql` — `loan_payments.account_id`: escolher em qual conta o pagamento/recebimento de empréstimo cai (triggers de saldo, edição/exclusão do empréstimo e checagem de dono atualizados). Rodar depois da 027.
   29. `029_recurrences.sql` — `recurrences` (valor fixo/variável/por ocorrência, pausa/encerramento, série antiga adotada sem tocar movimentações) + `transactions.recurrence_id/recurrence_date` com índice único anti-duplicidade, RLS, paywall e checagem de dono. Rodar depois da 028.
   30. `030_app_events.sql` — medição própria do funil e de erros (`app_events`, só INSERT para visitantes; leitura só por funções de admin; retenção de 90 dias). Rodar depois da 029.
5. Em **Authentication → URL Configuration**, adicione a URL local (`http://localhost:5173`) em Site URL e Redirect URLs para que o fluxo de recuperação de senha funcione.
6. Para tornar seu próprio usuário administrador: cadastre-se normalmente no app e depois rode no SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'seu-email@exemplo.com');
   ```
