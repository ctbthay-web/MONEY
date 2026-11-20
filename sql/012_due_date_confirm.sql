-- Money — 012_due_date_confirm.sql
-- Agora que "transactions" tem due_date separado de date (011), o INSERT só deve confirmar
-- sozinho (applied_to_balance = true) usando o vencimento de verdade — due_date quando
-- preenchido, senão date como antes. Sem isso, lançar hoje algo com vencimento futuro
-- (ex: Data = hoje, Vencimento = mês que vem) ficava marcado como "Pago" na hora, errado.

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
    if old.applied_to_balance then
      old_delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
      update public.accounts set balance_cents = balance_cents + old_delta where id = old.account_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
