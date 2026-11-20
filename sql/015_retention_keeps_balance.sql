-- Money — 015_retention_keeps_balance.sql
-- 1) A limpeza de retenção (movimentações com mais de 6 meses) NÃO pode mexer no saldo das
--    contas. Como o DELETE dispara o trigger que desfaz o efeito da movimentação no saldo, a
--    limpeza agora liga uma flag local à transação (money.skip_balance) e o trigger, vendo a
--    flag, não reverte o saldo. Exclusão manual pelo usuário continua revertendo normalmente.
-- 2) As funções internas de manutenção (limpeza e "vencer" lançamentos) eram executáveis por
--    qualquer usuário via RPC — agora só o banco (cron) e as funções admin (que checam
--    is_admin()) conseguem chamá-las.

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
    new.applied_to_balance := (coalesce(new.due_date, new.date) <= current_date);
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
    if old.applied_to_balance and coalesce(current_setting('money.skip_balance', true), '') <> 'on' then
      old_delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
      update public.accounts set balance_cents = balance_cents + old_delta where id = old.account_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.cleanup_old_transactions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  perform set_config('money.skip_balance', 'on', true);
  delete from public.transactions
  where date < (current_date - interval '6 months');
  get diagnostics deleted_count = row_count;
  perform set_config('money.skip_balance', 'off', true);
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_old_transactions() from public, anon, authenticated;
revoke execute on function public.apply_due_transactions() from public, anon, authenticated;
revoke execute on function public.apply_due_transfers() from public, anon, authenticated;
revoke execute on function public.apply_due_transactions_and_transfers() from public, anon, authenticated;
