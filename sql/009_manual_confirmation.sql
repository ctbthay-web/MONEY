-- Money — 009_manual_confirmation.sql
-- Remove a aplicação automática por data (cron diário) de movimentações/transferências
-- futuras. Uma movimentação/transferência com data futura só entra no saldo quando o
-- usuário CONFIRMAR manualmente que pagou/recebeu — nunca sozinho, só porque a data chegou.

-- 1) desliga o job diário que "vencia" lançamentos futuros sozinho
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('money-apply-due-transactions')
      where exists (select 1 from cron.job where jobname = 'money-apply-due-transactions');
  end if;
end;
$$;

-- 2) trigger de transactions: no INSERT só confirma automaticamente se a data já chegou
-- (ou seja, é um lançamento de algo que já aconteceu). No UPDATE, respeita o valor de
-- applied_to_balance que o cliente enviar — nunca recalcula a partir da data sozinho.
create or replace function public.apply_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_delta bigint;
  new_delta bigint;
begin
  if tg_op = 'INSERT' then
    new.applied_to_balance := (new.date <= current_date);
    if new.applied_to_balance then
      new_delta := case when new.type = 'income' then new.amount_cents else -new.amount_cents end;
      update public.accounts set balance_cents = balance_cents + new_delta where id = new.account_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if old.applied_to_balance then
      old_delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
      update public.accounts set balance_cents = balance_cents + old_delta where id = old.account_id;
    end if;
    if new.applied_to_balance then
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

-- 3) mesma lógica para transfers
create or replace function public.apply_transfer_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.applied_to_balance := (new.date <= current_date);
    if new.applied_to_balance then
      update public.accounts set balance_cents = balance_cents - new.amount_cents where id = new.from_account_id;
      update public.accounts set balance_cents = balance_cents + new.amount_cents where id = new.to_account_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if old.applied_to_balance then
      update public.accounts set balance_cents = balance_cents + old.amount_cents where id = old.from_account_id;
      update public.accounts set balance_cents = balance_cents - old.amount_cents where id = old.to_account_id;
    end if;
    if new.applied_to_balance then
      update public.accounts set balance_cents = balance_cents - new.amount_cents where id = new.from_account_id;
      update public.accounts set balance_cents = balance_cents + new.amount_cents where id = new.to_account_id;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    if old.applied_to_balance then
      update public.accounts set balance_cents = balance_cents + old.amount_cents where id = old.from_account_id;
      update public.accounts set balance_cents = balance_cents - old.amount_cents where id = old.to_account_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
