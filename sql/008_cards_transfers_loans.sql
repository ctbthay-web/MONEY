-- Money — 008_cards_transfers_loans.sql
-- Fatura de cartão com fechamento/vencimento reais, transferências entre contas e empréstimos.

-- ========== cartão: dia de fechamento e vencimento ==========
alter table public.accounts
  add column if not exists closing_day smallint check (closing_day between 1 and 31),
  add column if not exists due_day smallint check (due_day between 1 and 31);

-- ========== transferências entre contas (não é receita nem despesa) ==========
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_account_id uuid not null references public.accounts (id) on delete cascade,
  to_account_id uuid not null references public.accounts (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  description text,
  date date not null default current_date,
  applied_to_balance boolean not null default false,
  -- quando o destino é um cartão de crédito, marca qual fatura (ex: '2026-10') essa
  -- transferência liquidou — é assim que uma fatura fica "paga" sem duplicar despesa.
  invoice_period text,
  created_at timestamptz not null default now(),
  constraint transfers_different_accounts check (from_account_id <> to_account_id)
);

create index if not exists transfers_user_id_idx on public.transfers (user_id, date desc);
create index if not exists transfers_to_account_period_idx on public.transfers (to_account_id, invoice_period);

alter table public.transfers enable row level security;
create policy "transfers_select_own" on public.transfers for select using (user_id = auth.uid());
create policy "transfers_insert_own" on public.transfers for insert with check (user_id = auth.uid());
create policy "transfers_update_own" on public.transfers for update using (user_id = auth.uid());
create policy "transfers_delete_own" on public.transfers for delete using (user_id = auth.uid());

create or replace function public.apply_transfer_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_due boolean;
begin
  if tg_op = 'INSERT' then
    is_due := (new.date <= current_date);
    new.applied_to_balance := is_due;
    if is_due then
      update public.accounts set balance_cents = balance_cents - new.amount_cents where id = new.from_account_id;
      update public.accounts set balance_cents = balance_cents + new.amount_cents where id = new.to_account_id;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if old.applied_to_balance then
      update public.accounts set balance_cents = balance_cents + old.amount_cents where id = old.from_account_id;
      update public.accounts set balance_cents = balance_cents - old.amount_cents where id = old.to_account_id;
    end if;
    is_due := (new.date <= current_date);
    new.applied_to_balance := is_due;
    if is_due then
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

drop trigger if exists apply_transfer_to_balance on public.transfers;
create trigger apply_transfer_to_balance
  before insert or update or delete on public.transfers
  for each row execute function public.apply_transfer_to_balance();

-- inclui transferências vencidas na mesma rotina diária de "vencer" lançamentos futuros
create or replace function public.apply_due_transfers()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  affected bigint;
begin
  update public.accounts a set balance_cents = balance_cents - t.amount_cents
  from public.transfers t
  where t.from_account_id = a.id and t.applied_to_balance = false and t.date <= current_date;

  update public.accounts a set balance_cents = balance_cents + t.amount_cents
  from public.transfers t
  where t.to_account_id = a.id and t.applied_to_balance = false and t.date <= current_date;

  update public.transfers set applied_to_balance = true
  where applied_to_balance = false and date <= current_date;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.apply_due_transactions_and_transfers()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  a bigint;
  b bigint;
begin
  a := public.apply_due_transactions();
  b := public.apply_due_transfers();
  return coalesce(a, 0) + coalesce(b, 0);
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
  return public.apply_due_transactions_and_transfers();
end;
$$;

-- ========== empréstimos ==========
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  counterparty text not null,
  direction text not null check (direction in ('lent', 'borrowed')),
  principal_cents bigint not null check (principal_cents > 0),
  date date not null default current_date,
  note text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists loans_user_id_idx on public.loans (user_id);
create index if not exists loan_payments_loan_id_idx on public.loan_payments (loan_id);

alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;

create policy "loans_select_own" on public.loans for select using (user_id = auth.uid());
create policy "loans_insert_own" on public.loans for insert with check (user_id = auth.uid());
create policy "loans_update_own" on public.loans for update using (user_id = auth.uid());
create policy "loans_delete_own" on public.loans for delete using (user_id = auth.uid());

create policy "loan_payments_select_own" on public.loan_payments for select using (user_id = auth.uid());
create policy "loan_payments_insert_own" on public.loan_payments for insert with check (user_id = auth.uid());
create policy "loan_payments_delete_own" on public.loan_payments for delete using (user_id = auth.uid());

-- concessão do empréstimo afeta o saldo na hora (lent: sai da conta; borrowed: entra na conta)
create or replace function public.apply_loan_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta bigint;
begin
  if tg_op = 'INSERT' then
    delta := case when new.direction = 'lent' then -new.principal_cents else new.principal_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;
    return new;
  elsif tg_op = 'DELETE' then
    delta := case when old.direction = 'lent' then old.principal_cents else -old.principal_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists apply_loan_to_balance on public.loans;
create trigger apply_loan_to_balance
  after insert or delete on public.loans
  for each row execute function public.apply_loan_to_balance();

-- pagamento/recebimento de parcela do empréstimo (lent: devolução entra; borrowed: pagamento sai)
create or replace function public.apply_loan_payment_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_direction text;
  loan_account uuid;
  delta bigint;
begin
  if tg_op = 'INSERT' then
    select direction, account_id into loan_direction, loan_account from public.loans where id = new.loan_id;
    delta := case when loan_direction = 'lent' then new.amount_cents else -new.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = loan_account;
    return new;
  elsif tg_op = 'DELETE' then
    select direction, account_id into loan_direction, loan_account from public.loans where id = old.loan_id;
    delta := case when loan_direction = 'lent' then -old.amount_cents else old.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = loan_account;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists apply_loan_payment_to_balance on public.loan_payments;
create trigger apply_loan_payment_to_balance
  after insert or delete on public.loan_payments
  for each row execute function public.apply_loan_payment_to_balance();

-- reagenda o job diário para também vencer transferências futuras — só roda se pg_cron
-- já estiver habilitado (sql/005); se não estiver, não faz nada (sem erro).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('money-apply-due-transactions')
      where exists (select 1 from cron.job where jobname = 'money-apply-due-transactions');
    perform cron.schedule(
      'money-apply-due-transactions',
      '5 0 * * *',
      $cron$ select public.apply_due_transactions_and_transfers(); $cron$
    );
  end if;
end;
$$;
