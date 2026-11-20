-- Money — 028_loan_payment_account.sql
-- Escolher EM QUAL CONTA o pagamento/recebimento de um empréstimo cai.
-- Antes, todo pagamento mexia só na conta onde o empréstimo foi lançado. Agora cada pagamento pode ter a
-- própria conta (loan_payments.account_id); sem conta informada (pagamentos antigos), vale a do empréstimo.
--  * apply_loan_payment_to_balance: usa a conta do pagamento (ou a do empréstimo);
--  * apply_loan_to_balance (editar/excluir empréstimo): desfaz/reaplica cada pagamento na conta onde ele caiu;
--  * check_row_ownership: a conta do pagamento tem que ser do próprio usuário.
-- Rodar depois da 027.

alter table public.loan_payments
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

-- ---------- saldo: pagamento na conta escolhida ----------
create or replace function public.apply_loan_payment_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_direction text;
  loan_account uuid;
  target uuid;
  delta bigint;
begin
  if tg_op = 'INSERT' then
    select direction, account_id into loan_direction, loan_account from public.loans where id = new.loan_id;
    target := coalesce(new.account_id, loan_account);
    delta := case when loan_direction = 'lent' then new.amount_cents else -new.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = target;
    return new;
  elsif tg_op = 'DELETE' then
    select direction, account_id into loan_direction, loan_account from public.loans where id = old.loan_id;
    if not found then
      -- exclusão em cascata do empréstimo: o saldo já foi desfeito no BEFORE DELETE do empréstimo
      return old;
    end if;
    target := coalesce(old.account_id, loan_account);
    delta := case when loan_direction = 'lent' then -old.amount_cents else old.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = target;
    return old;
  end if;
  return null;
end;
$$;

-- ---------- saldo: editar/excluir empréstimo com pagamentos em contas diferentes ----------
create or replace function public.apply_loan_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta bigint;
  paid_total bigint;
  paid_old bigint;
  p record;
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

    select coalesce(sum(amount_cents), 0) into paid_total from public.loan_payments where loan_id = new.id;
    if new.principal_cents < paid_total then
      raise exception 'O valor não pode ser menor que o já devolvido.';
    end if;

    -- pagamentos que estão na conta do empréstimo acompanham o empréstimo se a conta mudar
    select coalesce(sum(amount_cents), 0) into paid_old
      from public.loan_payments
      where loan_id = new.id and coalesce(account_id, old.account_id) = old.account_id;

    delta := case when old.direction = 'lent' then old.principal_cents - paid_old else -old.principal_cents + paid_old end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    delta := case when new.direction = 'lent' then -new.principal_cents + paid_old else new.principal_cents - paid_old end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;

    if new.account_id is distinct from old.account_id then
      update public.loan_payments
        set account_id = new.account_id
        where loan_id = new.id and coalesce(account_id, old.account_id) = old.account_id;
    end if;

    -- pagamentos em OUTRAS contas ficam onde estão; só se o sentido (emprestei/peguei) mudou, o efeito inverte
    if new.direction is distinct from old.direction then
      for p in
        select amount_cents, account_id from public.loan_payments
        where loan_id = new.id and account_id is not null and account_id <> new.account_id
      loop
        delta := case when old.direction = 'lent' then -p.amount_cents else p.amount_cents end
               + case when new.direction = 'lent' then p.amount_cents else -p.amount_cents end;
        update public.accounts set balance_cents = balance_cents + delta where id = p.account_id;
      end loop;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    -- roda em BEFORE DELETE: os pagamentos ainda existem. Desfaz a concessão na conta do empréstimo
    -- e cada pagamento na conta em que ele caiu.
    delta := case when old.direction = 'lent' then old.principal_cents else -old.principal_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    for p in select amount_cents, account_id from public.loan_payments where loan_id = old.id loop
      delta := case when old.direction = 'lent' then -p.amount_cents else p.amount_cents end;
      update public.accounts set balance_cents = balance_cents + delta where id = coalesce(p.account_id, old.account_id);
    end loop;
    return old;
  end if;
  return null;
end;
$$;

-- ---------- dono das referências (inclui a conta do pagamento) ----------
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
    if ok and new.account_id is not null then
      ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    end if;
  elsif tg_table_name = 'goal_contributions' then
    ok := exists (select 1 from public.goals where id = new.goal_id and user_id = new.user_id);
  elsif tg_table_name = 'budgets' then
    ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
  end if;

  if not ok then
    raise exception 'Referência inválida: o item não pertence a você.';
  end if;
  return new;
end;
$$;
