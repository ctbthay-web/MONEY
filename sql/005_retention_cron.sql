-- Money — 005_retention_cron.sql (OPCIONAL)
-- Agenda a limpeza automática de transações com mais de 6 meses usando pg_cron.
-- Requer habilitar a extensão "pg_cron" em Database > Extensions no painel do Supabase
-- antes de rodar este arquivo. Sem isso, use o botão "Executar limpeza" na área admin
-- do app, que chama a mesma função manualmente.

create extension if not exists pg_cron;

select cron.schedule(
  'money-cleanup-old-transactions',
  '0 3 1 * *', -- todo dia 1 às 03:00
  $$ select public.cleanup_old_transactions(); $$
);
