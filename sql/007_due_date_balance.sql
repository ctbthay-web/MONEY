-- Money — 007_due_date_balance.sql
-- Corrige o saldo das contas para só considerar movimentações já vencidas (date <= hoje).
-- Parcelas e recorrências futuras (ex: parcela 2/3 no mês que vem) não devem afetar o
-- saldo disponível hoje — só quando a data delas chegar.

alter table public.transactions
  add column if not exists applied_to_balance boolean not null default false;

-- ========== trigger: só aplica no saldo se a movimentação já venceu ==========
create or replace function public.apply_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_delta bigint;
  new_delta bigint;
  is_due boolean;
begin
  if tg_op = 'INSERT' then
    is_due := (new.date <= current_date);
    new.applied_to_balance := is_due;
    if is_due then
      new_delta := case when new.type = 'income' then new.amount_cents else -new.amount_cents end;
      update public.accounts set balance_cents = balance_cents + new_delta where id = new.account_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if old.applied_to_balance then
      old_delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
      update public.accounts set balance_cents = balance_cents + old_delta where id = old.account_id;
    end if;

    is_due := (new.date <= current_date);
    new.applied_to_balance := is_due;
    if is_due then
      new_delta := case when new.type = 'income' then new.amount_cents else -new.amount_cents end;
      update public.accounts set balance_cents = balance_cents + new_delta where id = new.account_id;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    if old.applied_to_balance then
      old_delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
      update public.accounts set balance_cents = balance_cents + old_delta where id = old.account_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists apply_transaction_to_balance on public.transactions;
create trigger apply_transaction_to_balance
  before insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_to_balance();

-- ========== função diária: "vence" as movimentações cuja data chegou ==========
create or replace function public.apply_due_transactions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  with due as (
    select id, account_id, type, amount_cents
    from public.transactions
    where applied_to_balance = false and date <= current_date
  ),
  agg as (
    select account_id, sum(case when type = 'income' then amount_cents else -amount_cents end) as delta
    from due
    group by account_id
  )
  update public.accounts a
  set balance_cents = a.balance_cents + agg.delta
  from agg
  where a.id = agg.account_id;

  update public.transactions
  set applied_to_balance = true
  where applied_to_balance = false and date <= current_date;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.admin_run_apply_due_transactions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return public.apply_due_transactions();
end;
$$;

-- agenda diária (requer extensão pg_cron habilitada — ver 005_retention_cron.sql)
select cron.schedule(
  'money-apply-due-transactions',
  '5 0 * * *',
  $$ select public.apply_due_transactions(); $$
);

-- ========== correção pontual: reverte o efeito de movimentações futuras já aplicadas
-- indevidamente pelo trigger antigo (que não olhava a data), sem tocar em saldos
-- definidos manualmente ou em movimentações já vencidas ==========
with wrongly_applied as (
  select account_id,
         sum(case when type = 'income' then amount_cents else -amount_cents end) as wrong_delta
  from public.transactions
  where date > current_date
  group by account_id
)
update public.accounts a
set balance_cents = a.balance_cents - wrongly_applied.wrong_delta
from wrongly_applied
where a.id = wrongly_applied.account_id;

update public.transactions set applied_to_balance = (date <= current_date);
