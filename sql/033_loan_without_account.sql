-- Money — 033_loan_without_account.sql
-- Empréstimo "só registrar": account_id pode ficar vazio. Serve como controle de dívida (a receber / a pagar)
-- sem mexer no saldo de nenhuma conta. Os pagamentos continuam caindo na conta escolhida no pagamento.
-- Os triggers de saldo já ignoram conta vazia (UPDATE ... WHERE id = NULL não altera nada); aqui só:
--   1) liberamos o NULL na coluna;
--   2) a checagem de dono aceita conta vazia;
--   3) trocar a conta entre "nenhuma" e uma conta real fica bloqueado quando já há pagamentos
--      (os pagamentos que dependem da conta do empréstimo perderiam o destino).
-- Nenhum dado existente é alterado.

alter table public.loans alter column account_id drop not null;

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
    if ok and new.recurrence_id is not null then
      ok := exists (select 1 from public.recurrences where id = new.recurrence_id and user_id = new.user_id);
    end if;
  elsif tg_table_name = 'transfers' then
    ok := exists (select 1 from public.accounts where id = new.from_account_id and user_id = new.user_id)
      and exists (select 1 from public.accounts where id = new.to_account_id and user_id = new.user_id);
  elsif tg_table_name = 'loans' then
    -- conta vazia = "só registrar" (não mexe em saldo)
    ok := new.account_id is null or exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
  elsif tg_table_name = 'loan_payments' then
    ok := exists (select 1 from public.loans where id = new.loan_id and user_id = new.user_id);
    if ok and new.account_id is not null then
      ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    end if;
  elsif tg_table_name = 'goal_contributions' then
    ok := exists (select 1 from public.goals where id = new.goal_id and user_id = new.user_id);
  elsif tg_table_name = 'budgets' then
    ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
  elsif tg_table_name = 'recurrences' then
    ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    if ok and new.category_id is not null then
      ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
    end if;
    if ok and new.series_id is not null then
      ok := exists (select 1 from public.transactions where series_id = new.series_id and user_id = new.user_id)
        or not exists (select 1 from public.transactions where series_id = new.series_id);
    end if;
  end if;

  if not ok then
    raise exception 'Referência inválida: o item não pertence a você.';
  end if;
  return new;
end;
$$;

create or replace function public.guard_loan_account_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.account_id is null) <> (new.account_id is null)
     and exists (select 1 from public.loan_payments where loan_id = new.id) then
    raise exception 'Este empréstimo já tem pagamentos: não dá para trocar entre "só registrar" e uma conta.';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_loan_account_change() from public, anon, authenticated;

drop trigger if exists a1_guard_loan_account on public.loans;
create trigger a1_guard_loan_account
  before update of account_id on public.loans
  for each row execute function public.guard_loan_account_change();
