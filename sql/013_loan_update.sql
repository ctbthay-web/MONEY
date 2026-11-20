-- Money — 013_loan_update.sql
-- Permite editar um empréstimo (valor, conta, tipo emprestei/peguei) mantendo o saldo correto:
-- no UPDATE, desfaz o efeito antigo (concessão + pagamentos já registrados) na conta antiga e
-- aplica o novo na conta nova. Impede reduzir o valor abaixo do que já foi devolvido.

create or replace function public.apply_loan_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta bigint;
  paid bigint;
begin
  if tg_op = 'INSERT' then
    delta := case when new.direction = 'lent' then -new.principal_cents else new.principal_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;
    return new;

  elsif tg_op = 'UPDATE' then
    if new.principal_cents is not distinct from old.principal_cents
       and new.direction is not distinct from old.direction
       and new.account_id is not distinct from old.account_id then
      return new;
    end if;

    select coalesce(sum(amount_cents), 0) into paid from public.loan_payments where loan_id = new.id;
    if new.principal_cents < paid then
      raise exception 'O valor não pode ser menor que o já devolvido.';
    end if;

    -- desfaz o efeito antigo (concessão + pagamentos) na conta antiga
    delta := case when old.direction = 'lent' then old.principal_cents - paid else -old.principal_cents + paid end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    -- aplica o novo efeito na conta nova
    delta := case when new.direction = 'lent' then -new.principal_cents + paid else new.principal_cents - paid end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;
    return new;

  elsif tg_op = 'DELETE' then
    -- roda em BEFORE DELETE: os pagamentos ainda existem, então desfaz concessão + pagamentos.
    -- (Em AFTER DELETE o cascade já apagou os pagamentos e o saldo ficava errado.)
    select coalesce(sum(amount_cents), 0) into paid from public.loan_payments where loan_id = old.id;
    delta := case when old.direction = 'lent' then old.principal_cents - paid else -old.principal_cents + paid end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists apply_loan_to_balance on public.loans;
create trigger apply_loan_to_balance
  after insert or update on public.loans
  for each row execute function public.apply_loan_to_balance();

drop trigger if exists apply_loan_to_balance_delete on public.loans;
create trigger apply_loan_to_balance_delete
  before delete on public.loans
  for each row execute function public.apply_loan_to_balance();
