-- Money — 018_ownership_checks.sql
-- CORREÇÃO DE SEGURANÇA: as policies só checavam user_id = auth.uid() da própria linha, então
-- um usuário podia criar movimentação/empréstimo/transferência/aporte apontando para a conta ou
-- meta de OUTRA pessoa — e os triggers (security definer) alteravam o saldo dela.
-- Agora, antes de qualquer INSERT/UPDATE, o banco confirma que tudo que a linha referencia
-- (conta, categoria, empréstimo, meta) pertence ao mesmo usuário. O nome do trigger começa com
-- "a0_" para rodar ANTES dos triggers de saldo (que disparam em ordem alfabética).

create or replace function public.check_row_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean := true;
begin
  if tg_table_name = 'transactions' then
    ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    if ok and new.category_id is not null then
      ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
    end if;
  elsif tg_table_name = 'transfers' then
    ok := exists (select 1 from public.accounts where id = new.from_account_id and user_id = new.user_id)
      and exists (select 1 from public.accounts where id = new.to_account_id and user_id = new.user_id);
  elsif tg_table_name = 'loans' then
    ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
  elsif tg_table_name = 'loan_payments' then
    ok := exists (select 1 from public.loans where id = new.loan_id and user_id = new.user_id);
  elsif tg_table_name = 'goal_contributions' then
    ok := exists (select 1 from public.goals where id = new.goal_id and user_id = new.user_id);
  end if;

  if not ok then
    raise exception 'Referência inválida: o item não pertence a você.';
  end if;
  return new;
end;
$$;

drop trigger if exists a0_check_ownership on public.transactions;
create trigger a0_check_ownership before insert or update on public.transactions
  for each row execute function public.check_row_ownership();

drop trigger if exists a0_check_ownership on public.transfers;
create trigger a0_check_ownership before insert or update on public.transfers
  for each row execute function public.check_row_ownership();

drop trigger if exists a0_check_ownership on public.loans;
create trigger a0_check_ownership before insert or update on public.loans
  for each row execute function public.check_row_ownership();

drop trigger if exists a0_check_ownership on public.loan_payments;
create trigger a0_check_ownership before insert or update on public.loan_payments
  for each row execute function public.check_row_ownership();

drop trigger if exists a0_check_ownership on public.goal_contributions;
create trigger a0_check_ownership before insert or update on public.goal_contributions
  for each row execute function public.check_row_ownership();
