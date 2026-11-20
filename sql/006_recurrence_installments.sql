-- Money — 006_recurrence_installments.sql
-- Suporte a movimentações recorrentes e parceladas. Cada ocorrência é uma linha normal
-- em transactions (o trigger de saldo já existente continua funcionando sem alteração);
-- series_id agrupa as ocorrências de uma mesma recorrência/parcelamento.

alter table public.transactions
  add column if not exists series_id uuid,
  add column if not exists installment_number int,
  add column if not exists installment_total int,
  add column if not exists recurrence_frequency text check (recurrence_frequency in ('weekly', 'monthly', 'yearly'));

create index if not exists transactions_series_id_idx on public.transactions (series_id);
