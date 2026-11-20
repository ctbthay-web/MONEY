-- Money — MIGRAÇÕES COMPLETAS para o Supabase de HOMOLOGAÇÃO (001–026 + 027 + 028). Rode no SQL Editor do projeto de HOMOLOGAÇÃO, nunca no de produção.
-- Pré-requisito: habilite as extensões pg_cron e pg_net (Database > Extensions) se as migrações 005/021 pedirem.

-- ======== 001_schema.sql ========
-- Money — 001_schema.sql
-- Tabelas principais. Todos os valores monetários em centavos (bigint).

create extension if not exists "pgcrypto";

-- ========== plans (preparação para SaaS futuro, sem cobrança agora) ==========
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_cents bigint not null default 0,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ========== profiles ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  plan_id text not null default 'free' references public.plans (id),
  trial_ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== categories ==========
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  color text not null default '#2DD4BF',
  icon text not null default 'tag',
  created_at timestamptz not null default now()
);

create index if not exists categories_user_id_idx on public.categories (user_id);

-- ========== accounts ==========
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('checking', 'savings', 'credit_card', 'wallet', 'investment')),
  color text not null default '#2DD4BF',
  icon text not null default 'wallet',
  credit_limit_cents bigint,
  balance_cents bigint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- ========== transactions ==========
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  description text not null,
  note text,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_id_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_account_id_idx on public.transactions (account_id);
create index if not exists transactions_category_id_idx on public.transactions (category_id);

-- ========== goals (metas / reservas) ==========
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_cents bigint not null check (target_cents > 0),
  accumulated_cents bigint not null default 0 check (accumulated_cents >= 0),
  deadline date,
  color text not null default '#2DD4BF',
  icon text not null default 'target',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals (user_id);

-- ========== goal_contributions (aportes/resgates, independente de transactions) ==========
create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  note text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists goal_contributions_goal_id_idx on public.goal_contributions (goal_id);

-- ======== 002_functions_triggers.sql ========
-- Money — 002_functions_triggers.sql

-- ========== is_admin(): usada nas policies para dar acesso administrativo ==========
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ========== updated_at automático ==========
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.accounts;
create trigger set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.transactions;
create trigger set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.goals;
create trigger set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- ========== handle_new_user(): cria profile automaticamente no cadastro ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, plan_id, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'user',
    'free',
    now() + interval '14 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== saldo de conta mantido por trigger (sobrevive à limpeza de transactions) ==========
create or replace function public.apply_transaction_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta bigint;
begin
  if tg_op = 'INSERT' then
    delta := case when new.type = 'income' then new.amount_cents else -new.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;
    return new;
  elsif tg_op = 'UPDATE' then
    -- reverte o efeito antigo e aplica o novo (cobre mudança de valor, tipo ou conta)
    delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    delta := case when new.type = 'income' then new.amount_cents else -new.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;
    return new;
  elsif tg_op = 'DELETE' then
    delta := case when old.type = 'income' then -old.amount_cents else old.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists apply_transaction_to_balance on public.transactions;
create trigger apply_transaction_to_balance
  after insert or update or delete on public.transactions
  for each row execute function public.apply_transaction_to_balance();

-- ========== goal_contributions aplica delta em goals.accumulated_cents ==========
create or replace function public.apply_goal_contribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.goals set accumulated_cents = accumulated_cents + new.amount_cents where id = new.goal_id;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.goals set accumulated_cents = accumulated_cents - old.amount_cents + new.amount_cents where id = new.goal_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.goals set accumulated_cents = accumulated_cents - old.amount_cents where id = old.goal_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists apply_goal_contribution on public.goal_contributions;
create trigger apply_goal_contribution
  after insert or update or delete on public.goal_contributions
  for each row execute function public.apply_goal_contribution();

-- ========== retenção: remove detalhe de transações com mais de 6 meses ==========
-- Nunca apaga profiles, categories, accounts, goals, goal_contributions ou plans.
-- O saldo das contas e o valor acumulado das metas já estão persistidos em colunas
-- próprias (mantidas pelos triggers acima), então esta limpeza não afeta totais.
create or replace function public.cleanup_old_transactions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.transactions
  where date < (current_date - interval '6 months')
  returning 1 into deleted_count;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- RPC exposta para admin disparar manualmente pela UI (protegida por is_admin() dentro da função)
create or replace function public.admin_run_transaction_cleanup()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return public.cleanup_old_transactions();
end;
$$;

-- ========== RPC: promover/rebaixar usuário (somente admin) ==========
create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'invalid role';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

-- ======== 003_rls.sql ========
-- Money — 003_rls.sql
-- Row Level Security: cada usuário só acessa os próprios dados; admin tem leitura ampliada.

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

-- ---------- plans ----------
drop policy if exists "plans_select_all" on public.plans;
create policy "plans_select_all" on public.plans
  for select using (true);

-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

-- ---------- categories ----------
drop policy if exists "categories_select_own_or_default" on public.categories;
create policy "categories_select_own_or_default" on public.categories
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert with check (
    (user_id = auth.uid()) or (user_id is null and public.is_admin())
  );

drop policy if exists "categories_update_own_or_admin_default" on public.categories;
create policy "categories_update_own_or_admin_default" on public.categories
  for update using (
    user_id = auth.uid() or (user_id is null and public.is_admin())
  );

drop policy if exists "categories_delete_own_or_admin_default" on public.categories;
create policy "categories_delete_own_or_admin_default" on public.categories
  for delete using (
    user_id = auth.uid() or (user_id is null and public.is_admin())
  );

-- ---------- accounts ----------
drop policy if exists "accounts_all_own" on public.accounts;
create policy "accounts_select_own" on public.accounts for select using (user_id = auth.uid());
create policy "accounts_insert_own" on public.accounts for insert with check (user_id = auth.uid());
create policy "accounts_update_own" on public.accounts for update using (user_id = auth.uid());
create policy "accounts_delete_own" on public.accounts for delete using (user_id = auth.uid());

-- ---------- transactions ----------
create policy "transactions_select_own" on public.transactions for select using (user_id = auth.uid());
create policy "transactions_insert_own" on public.transactions for insert with check (user_id = auth.uid());
create policy "transactions_update_own" on public.transactions for update using (user_id = auth.uid());
create policy "transactions_delete_own" on public.transactions for delete using (user_id = auth.uid());

-- ---------- goals ----------
create policy "goals_select_own" on public.goals for select using (user_id = auth.uid());
create policy "goals_insert_own" on public.goals for insert with check (user_id = auth.uid());
create policy "goals_update_own" on public.goals for update using (user_id = auth.uid());
create policy "goals_delete_own" on public.goals for delete using (user_id = auth.uid());

-- ---------- goal_contributions ----------
create policy "goal_contributions_select_own" on public.goal_contributions for select using (user_id = auth.uid());
create policy "goal_contributions_insert_own" on public.goal_contributions for insert with check (user_id = auth.uid());
create policy "goal_contributions_update_own" on public.goal_contributions for update using (user_id = auth.uid());
create policy "goal_contributions_delete_own" on public.goal_contributions for delete using (user_id = auth.uid());

-- ---------- admin: leitura agregada de todas as contas/transações (stats) ----------
drop policy if exists "accounts_select_admin" on public.accounts;
create policy "accounts_select_admin" on public.accounts for select using (public.is_admin());

drop policy if exists "transactions_select_admin" on public.transactions;
create policy "transactions_select_admin" on public.transactions for select using (public.is_admin());

-- ======== 004_seed.sql ========
-- Money — 004_seed.sql
-- Plano gratuito (estrutura pronta para SaaS futuro) + categorias padrão do sistema (user_id null).

insert into public.plans (id, name, price_cents, limits)
values ('free', 'Free', 0, '{"max_accounts": 5, "max_goals": 5}'::jsonb)
on conflict (id) do nothing;

insert into public.categories (user_id, name, type, color, icon) values
  (null, 'Salário', 'income', '#2DD4BF', 'banknote'),
  (null, 'Freelance', 'income', '#14E0B4', 'briefcase'),
  (null, 'Investimentos', 'income', '#4FD1C5', 'trending-up'),
  (null, 'Outras receitas', 'income', '#81E6D9', 'plus-circle'),
  (null, 'Moradia', 'expense', '#F87171', 'home'),
  (null, 'Alimentação', 'expense', '#FB923C', 'utensils'),
  (null, 'Transporte', 'expense', '#FBBF24', 'car'),
  (null, 'Saúde', 'expense', '#F472B6', 'heart-pulse'),
  (null, 'Educação', 'expense', '#A78BFA', 'graduation-cap'),
  (null, 'Lazer', 'expense', '#60A5FA', 'ticket'),
  (null, 'Compras', 'expense', '#F87171', 'shopping-bag'),
  (null, 'Assinaturas', 'expense', '#FB7185', 'repeat'),
  (null, 'Outras despesas', 'expense', '#94A3B8', 'more-horizontal')
on conflict do nothing;

-- ======== 005_retention_cron.sql ========
-- Money — 005_retention_cron.sql (OPCIONAL)
-- Agenda a limpeza automática de transações com mais de 6 meses usando pg_cron.
-- Requer habilitar a extensão "pg_cron" em Database > Extensions no painel do Supabase
-- antes de rodar este arquivo. Sem isso, use o botão "Executar limpeza" na área admin
-- do app, que chama a mesma função manualmente.

create extension if not exists pg_cron;

select cron.schedule(
  'money-cleanup-old-transactions',
  '0 3 1 * *', -- todo dia 1 às 03:00
  $$ select public.cleanup_old_transactions(); $$
);

-- ======== 006_recurrence_installments.sql ========
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

-- ======== 007_due_date_balance.sql ========
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

-- ======== 008_cards_transfers_loans.sql ========
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

-- ======== 009_manual_confirmation.sql ========
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

-- ======== 010_loan_due_date.sql ========
-- Money — 010_loan_due_date.sql
-- Adiciona data de vencimento (opcional) aos empréstimos: quando emprestei ou peguei
-- emprestado, dá pra registrar até quando espero a devolução / preciso devolver.

alter table public.loans add column if not exists due_date date;

-- ======== 011_transaction_due_date.sql ========
-- Money — 011_transaction_due_date.sql
-- Adiciona vencimento (opcional) separado da data em transactions: "Data" é quando a
-- movimentação foi registrada/aconteceu; "Vencimento" é quando ela vence de fato, quando
-- diferente. É só informativo — não participa do trigger de saldo (que continua usando
-- só a coluna "date", como já corrigido em 009_manual_confirmation.sql).

alter table public.transactions add column if not exists due_date date;

-- ======== 012_due_date_confirm.sql ========
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

-- ======== 013_loan_update.sql ========
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

-- ======== 014_fix_series_due_date.sql ========
-- Money — 014_fix_series_due_date.sql
-- Corrige séries (parcelado/recorrente) criadas quando o vencimento era copiado igual para
-- todas as parcelas. Só mexe em séries com mais de uma linha em que TODAS têm o mesmo due_date
-- (assinatura do erro); o vencimento passa a acompanhar a parcela: due_date + (n-1) períodos.
-- due_date é informativo (não entra no trigger de saldo), então não altera nenhum saldo.

update public.transactions t
set due_date = case coalesce(t.recurrence_frequency, 'monthly')
  when 'weekly' then t.due_date + ((t.installment_number - 1) * 7)
  when 'yearly' then (t.due_date + make_interval(years => t.installment_number - 1))::date
  else (t.due_date + make_interval(months => t.installment_number - 1))::date
end
where t.series_id in (
  select series_id from public.transactions
  where series_id is not null and due_date is not null
  group by series_id
  having count(*) > 1 and count(distinct due_date) = 1
)
and t.installment_number > 1;

-- ======== 015_retention_keeps_balance.sql ========
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

-- ======== 016_retention_keeps_unpaid.sql ========
-- Money — 016_retention_keeps_unpaid.sql
-- A limpeza de retenção (mais de 6 meses) passa a preservar o que ainda não foi quitado:
-- - conta comum: só apaga o que já foi confirmado (applied_to_balance = true);
-- - compra no cartão de crédito: só apaga se a fatura dela já foi paga (existe transfer com o
--   invoice_period dela para aquele cartão; o período segue a mesma regra do app: dia da compra
--   > fechamento => fatura do mês seguinte; sem fechamento cadastrado => mês da compra).
-- Continua sem mexer no saldo (flag money.skip_balance, ver 015).

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

  delete from public.transactions t
  using public.accounts a
  where a.id = t.account_id
    and t.date < (current_date - interval '6 months')
    and (
      (a.type <> 'credit_card' and t.applied_to_balance)
      or (
        a.type = 'credit_card'
        and exists (
          select 1 from public.transfers tr
          where tr.to_account_id = a.id
            and tr.invoice_period = case
              when a.closing_day is null then to_char(t.date, 'YYYY-MM')
              when extract(day from t.date) <= a.closing_day then to_char(t.date, 'YYYY-MM')
              else to_char(t.date + interval '1 month', 'YYYY-MM')
            end
        )
      )
    );
  get diagnostics deleted_count = row_count;

  perform set_config('money.skip_balance', 'off', true);
  return deleted_count;
end;
$$;

-- ======== 017_protect_profile_columns.sql ========
-- Money — 017_protect_profile_columns.sql
-- CORREÇÃO DE SEGURANÇA: a policy profiles_update_own deixava o usuário atualizar a própria
-- linha inteira, inclusive `role`, então qualquer usuário logado podia se promover a admin.
-- Agora um trigger impede que quem não é admin altere role, plan_id, trial_ends_at ou is_active
-- (o usuário continua podendo editar nome e avatar). Admin (via admin_set_user_role) e o
-- servidor (sem auth.uid(), ex.: painel do Supabase/migrações) continuam podendo.

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.plan_id is distinct from old.plan_id
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id then
      raise exception 'Você não tem permissão para alterar esses campos do perfil.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- ======== 018_ownership_checks.sql ========
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

-- ======== 019_subscription_access.sql ========
-- Money — 019_subscription_access.sql
-- Base de assinatura mensal (R$ 12,90) com teste grátis de 7 dias.
-- Regra de acesso (has_access): conta ativa E (admin OU vitalício OU teste em andamento OU
-- pago até uma data futura). Sem acesso o usuário ainda consegue LER seus dados e assinar, mas o
-- banco recusa qualquer INSERT/UPDATE/DELETE nas tabelas financeiras (trigger a00_paywall) —
-- a barreira é no banco, não só na tela. Cobrança (webhook) só precisa preencher paid_until.

alter table public.profiles
  add column if not exists is_lifetime boolean not null default false,
  add column if not exists paid_until timestamptz,
  add column if not exists billing_provider text,
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_status text;

-- uso vitalício: a usuária e o cadastro do Guilherme
update public.profiles
set is_lifetime = true
where id in (select id from auth.users where email in ('ctbthay@gmail.com', 'guigomes021@gmail.com'));

insert into public.plans (id, name, price_cents, limits)
values ('pro', 'Money Mensal', 1290, '{}'::jsonb)
on conflict (id) do update set name = excluded.name, price_cents = excluded.price_cents;

-- cadastro novo: 7 dias de teste (antes eram 14)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, plan_id, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'user',
    'free',
    now() + interval '7 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- o usuário logado tem acesso de escrita?
create or replace function public.has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_active
            and (p.role = 'admin'
                 or p.is_lifetime
                 or coalesce(p.trial_ends_at, '-infinity'::timestamptz) > now()
                 or coalesce(p.paid_until, '-infinity'::timestamptz) > now())
     from public.profiles p
     where p.id = auth.uid()),
    false)
$$;

revoke execute on function public.has_access() from public, anon;
grant execute on function public.has_access() to authenticated;

-- barreira no banco: sem acesso, nada de gravar nas tabelas financeiras
-- (auth.uid() nulo = servidor/cron/migração, sempre permitido)
create or replace function public.paywall_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.has_access() then
    raise exception 'Seu acesso está encerrado. Assine para continuar registrando e editando.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['accounts','categories','goals','goal_contributions','loans','loan_payments','transactions','transfers']
  loop
    execute format('drop trigger if exists a00_paywall on public.%I', t);
    execute format('create trigger a00_paywall before insert or update or delete on public.%I for each row execute function public.paywall_check()', t);
  end loop;
end;
$$;

-- o usuário não pode mexer nos campos de cobrança/acesso do próprio perfil
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.plan_id is distinct from old.plan_id
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id
       or new.is_lifetime is distinct from old.is_lifetime
       or new.paid_until is distinct from old.paid_until
       or new.billing_provider is distinct from old.billing_provider
       or new.billing_customer_id is distinct from old.billing_customer_id
       or new.billing_subscription_id is distinct from old.billing_subscription_id
       or new.billing_status is distinct from old.billing_status then
      raise exception 'Você não tem permissão para alterar esses campos do perfil.';
    end if;
  end if;
  return new;
end;
$$;

-- ======== 020_billing_events.sql ========
-- Money — 020_billing_events.sql
-- Registro dos pagamentos já processados pelo webhook do Asaas. A chave primária em
-- payment_id garante que o mesmo pagamento nunca estende o acesso duas vezes (o Asaas pode
-- reenviar o aviso, e cartão dispara CONFIRMED e depois RECEIVED). RLS ligado e SEM policies:
-- só o servidor (service role) lê/grava; nenhum usuário enxerga.

create table if not exists public.billing_events (
  payment_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null,
  created_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- ======== 021_notifications.sql ========
-- Money — 021_notifications.sql
-- Notificações push: preferências, aparelhos inscritos, programações do usuário e histórico.
-- Isolamento por usuário via RLS. O servidor (service role, função /api/notify-run) envia.
-- Sem linha em notification_preferences = notificações ATIVADAS (padrão para todo usuário novo).

-- ---------- preferências ----------
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  notify_due boolean not null default true,         -- contas a pagar (vencendo / atrasadas)
  notify_receivable boolean not null default true,  -- recebimentos previstos
  notify_cards boolean not null default true,       -- faturas de cartão
  notify_goals boolean not null default true,       -- metas (25/50/80/100%)
  notify_summary boolean not null default true,     -- resumo do mês
  days_before smallint not null default 1 check (days_before between 0 and 7),
  send_hour smallint not null default 9 check (send_hour between 0 and 23), -- horário de Brasília
  updated_at timestamptz not null default now()
);

-- ---------- aparelhos inscritos (Web Push) ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------- programações do usuário ----------
create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  message text check (message is null or char_length(message) <= 200),
  frequency text not null check (frequency in ('once', 'daily', 'weekly', 'monthly')),
  start_date date not null,            -- 1ª data (ou a data única); semanal/mensal repetem a partir dela
  send_time time not null default '09:00',
  active boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now()
);
create index if not exists notification_schedules_user_idx on public.notification_schedules (user_id);

-- ---------- histórico / anti-duplicidade ----------
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notification_log_user_idx on public.notification_log (user_id, created_at desc);

-- ---------- RLS ----------
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_schedules enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own" on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subs_own" on public.push_subscriptions;
create policy "push_subs_own" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notif_schedules_own" on public.notification_schedules;
create policy "notif_schedules_own" on public.notification_schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- histórico: o usuário só lê o próprio; quem grava é o servidor (service role)
drop policy if exists "notif_log_select_own" on public.notification_log;
create policy "notif_log_select_own" on public.notification_log
  for select using (user_id = auth.uid());
revoke insert, update, delete on public.notification_log from anon, authenticated;

-- ======== 022_plans_kiwify.sql ========
-- Money — 022_plans_kiwify.sql
-- Planos pagos (Start, Plus, Pro, Premium) vendidos pela Kiwify.
--  * limite de lançamentos por mês aplicado NO BANCO (constraint trigger no fim da transação);
--  * função tx_usage() para o app mostrar "x de N lançamentos";
--  * billing_pending: compra feita na Kiwify com e-mail que ainda não tem conta — o plano é
--    aplicado quando a conta com esse e-mail for criada;
--  * find_user_id_by_email(): só o servidor (service role) usa, para o webhook da Kiwify.
-- Quem está em teste grátis, é vitalício/admin ou assina o plano antigo ('pro', 12,90 sem limite)
-- continua sem limite.

insert into public.plans (id, name, price_cents, limits) values
  ('start',    'Start',    1990, '{"max_transactions_per_month": 25}'::jsonb),
  ('plus',     'Plus',     2990, '{"max_transactions_per_month": 50}'::jsonb),
  ('pro_plan', 'Pro',      3990, '{"max_transactions_per_month": 70}'::jsonb),
  ('premium', 'Premium', 5990, '{}'::jsonb)
on conflict (id) do update
  set name = excluded.name, price_cents = excluded.price_cents, limits = excluded.limits;

-- ---------- limite mensal ----------
-- início do mês corrente no horário de Brasília
create or replace function public.month_start_brt()
returns timestamptz
language sql
stable
as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- limite de lançamentos/mês do usuário (null = sem limite)
create or replace function public.tx_month_limit(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role = 'admin' or p.is_lifetime then null
    when coalesce(p.paid_until, '-infinity'::timestamptz) > now() then
      (select (pl.limits ->> 'max_transactions_per_month')::int from public.plans pl where pl.id = p.plan_id)
    else null -- teste grátis (ou sem acesso: quem barra é o paywall)
  end
  from public.profiles p
  where p.id = uid
$$;

-- lançamentos do mês: parcelamento/recorrência (mesmo series_id) conta como UM lançamento
create or replace function public.tx_used_this_month(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(series_id::text, id::text))::int
  from public.transactions
  where user_id = uid and created_at >= public.month_start_brt()
$$;

revoke execute on function public.tx_month_limit(uuid) from public, anon, authenticated;
revoke execute on function public.tx_used_this_month(uuid) from public, anon, authenticated;

create or replace function public.tx_usage()
returns table (used int, lim int)
language sql
stable
security definer
set search_path = public
as $$
  select public.tx_used_this_month(auth.uid()), public.tx_month_limit(auth.uid())
$$;

revoke execute on function public.tx_usage() from public, anon;
grant execute on function public.tx_usage() to authenticated;

-- confere no FIM da transação (vê o lote inteiro: importação de fatura, parcelamento etc.)
create or replace function public.check_tx_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
begin
  if auth.uid() is null then
    return null; -- servidor/cron/migração
  end if;
  lim := public.tx_month_limit(new.user_id);
  if lim is not null and public.tx_used_this_month(new.user_id) > lim then
    raise exception 'Você chegou ao limite de % lançamentos por mês do seu plano. Faça upgrade em Assinatura para continuar.', lim;
  end if;
  return null;
end;
$$;

drop trigger if exists z_tx_quota on public.transactions;
create constraint trigger z_tx_quota
  after insert on public.transactions
  deferrable initially deferred
  for each row execute function public.check_tx_quota();

-- ---------- compra na Kiwify antes de ter conta ----------
create table if not exists public.billing_pending (
  email text primary key,
  plan_id text not null references public.plans (id),
  paid_until timestamptz not null,
  billing_provider text not null default 'kiwify',
  billing_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.billing_pending enable row level security;
revoke all on public.billing_pending from anon, authenticated;

-- id do usuário pelo e-mail (só service role)
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- cadastro novo: 7 dias de teste + aplica compra pendente feita com o mesmo e-mail
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pend public.billing_pending%rowtype;
begin
  insert into public.profiles (id, full_name, role, plan_id, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'user',
    'free',
    now() + interval '7 days'
  )
  on conflict (id) do nothing;

  select * into pend from public.billing_pending where lower(email) = lower(new.email);
  if found then
    update public.profiles
    set plan_id = pend.plan_id,
        paid_until = pend.paid_until,
        billing_provider = pend.billing_provider,
        billing_subscription_id = pend.billing_subscription_id,
        billing_status = 'active'
    where id = new.id;
    delete from public.billing_pending where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

-- ======== 023_budgets_retention.sql ========
-- Money — 023_budgets_retention.sql
--  * budgets: orçamento mensal por categoria (plano Pro em diante; liberação por plano é na tela);
--  * notification_preferences.notify_budgets: avisos aos 80% e ao estourar o orçamento;
--  * retenção por plano: Pro guarda 24 meses, Premium/vitalício/admin nunca apagam, os demais 6 meses.
-- Rodar depois da 022.

-- ---------- orçamento por categoria ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.budgets enable row level security;

drop policy if exists "budgets_own" on public.budgets;
create policy "budgets_own" on public.budgets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sem acesso (teste/assinatura encerrados) o banco recusa gravar, como nas demais tabelas
drop trigger if exists a00_paywall on public.budgets;
create trigger a00_paywall before insert or update or delete on public.budgets
  for each row execute function public.paywall_check();

-- a categoria apontada tem que ser do próprio usuário (ou padrão do sistema); mesma função da 018
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
  elsif tg_table_name = 'budgets' then
    ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
  end if;

  if not ok then
    raise exception 'Referência inválida: o item não pertence a você.';
  end if;
  return new;
end;
$$;

drop trigger if exists a0_check_ownership on public.budgets;
create trigger a0_check_ownership before insert or update on public.budgets
  for each row execute function public.check_row_ownership();

-- ---------- aviso de orçamento ----------
alter table public.notification_preferences
  add column if not exists notify_budgets boolean not null default true;

-- ---------- retenção por plano ----------
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

  delete from public.transactions t
  using public.accounts a, public.profiles p
  where a.id = t.account_id
    and p.id = t.user_id
    -- Premium (assinatura em dia), vitalício e admin: nunca apaga
    and not (
      p.role = 'admin'
      or p.is_lifetime
      or (p.plan_id = 'premium' and coalesce(p.paid_until, '-infinity'::timestamptz) > now())
    )
    -- Pro (assinatura em dia): 24 meses; demais: 6 meses
    and t.date < current_date - make_interval(
      months => case
        when p.plan_id = 'pro_plan' and coalesce(p.paid_until, '-infinity'::timestamptz) > now() then 24
        else 6
      end
    )
    and (
      (a.type <> 'credit_card' and t.applied_to_balance)
      or (
        a.type = 'credit_card'
        and exists (
          select 1 from public.transfers tr
          where tr.to_account_id = a.id
            and tr.invoice_period = case
              when a.closing_day is null then to_char(t.date, 'YYYY-MM')
              when extract(day from t.date) <= a.closing_day then to_char(t.date, 'YYYY-MM')
              else to_char(t.date + interval '1 month', 'YYYY-MM')
            end
        )
      )
    );
  get diagnostics deleted_count = row_count;

  perform set_config('money.skip_balance', 'off', true);
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_old_transactions() from public, anon, authenticated;

-- ======== 024_no_trial.sql ========
-- Money — 024_no_trial.sql
-- Fim do teste grátis para cadastros novos: a conta nasce sem acesso (trial_ends_at nulo) e só passa a
-- registrar/editar depois de assinar um plano (a pessoa continua vendo os dados). Contas que já estão
-- em teste mantêm o prazo que já têm. Compra feita na Kiwify antes do cadastro (billing_pending) continua
-- sendo aplicada no cadastro. Rodar depois da 022.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pend public.billing_pending%rowtype;
begin
  insert into public.profiles (id, full_name, role, plan_id, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'user',
    'free',
    null
  )
  on conflict (id) do nothing;

  select * into pend from public.billing_pending where lower(email) = lower(new.email);
  if found then
    update public.profiles
    set plan_id = pend.plan_id,
        paid_until = pend.paid_until,
        billing_provider = pend.billing_provider,
        billing_subscription_id = pend.billing_subscription_id,
        billing_status = 'active'
    where id = new.id;
    delete from public.billing_pending where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

-- ======== 025_agent_name.sql ========
-- Money — 025_agent_name.sql
-- Nome personalizado da assistente (plano Premium). Fica no próprio perfil (profiles.agent_name):
-- já é 1 linha por usuário, já tem RLS (cada um só altera a própria linha) e não cria tabela nova.
--  * validação no banco: 2 a 20 caracteres, só letras/espaço/ponto/hífen/apóstrofo, sem espaços nas pontas;
--  * só quem tem direito ao recurso consegue gravar/alterar o nome (a tela também esconde, mas a barreira é aqui).
-- O histórico de conversas (quando existir) NÃO deve guardar o nome: guarda só quem falou (usuário/assistente)
-- e mostra o nome atual em tempo de exibição — assim trocar o nome nunca apaga nem reescreve conversas.

alter table public.profiles
  add column if not exists agent_name text;

alter table public.profiles drop constraint if exists profiles_agent_name_valid;
alter table public.profiles
  add constraint profiles_agent_name_valid check (
    agent_name is null
    or (
      agent_name = btrim(agent_name)
      and char_length(agent_name) between 2 and 20
      and agent_name ~ '^[[:alpha:]][[:alpha:] .''-]*$'
    )
  );

-- o usuário logado tem direito ao recurso Premium? (espelha effectivePlan/canUseFeature da tela)
--  admin, vitalício, ou: assinatura em dia com plano Premium (ou plano antigo, que tem tudo),
--  ou conta ainda em teste (que libera tudo).
create or replace function public.has_premium_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_active
            and (p.role = 'admin'
                 or p.is_lifetime
                 or case
                      when coalesce(p.paid_until, '-infinity'::timestamptz) > now()
                        then p.plan_id not in ('start', 'plus', 'pro_plan')
                      else coalesce(p.trial_ends_at, '-infinity'::timestamptz) > now()
                    end)
     from public.profiles p
     where p.id = auth.uid()),
    false)
$$;

revoke execute on function public.has_premium_access() from public, anon;
grant execute on function public.has_premium_access() to authenticated;

create or replace function public.guard_agent_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.agent_name is distinct from old.agent_name
     and auth.uid() is not null
     and not public.has_premium_access() then
    raise exception 'A assistente personalizada está disponível no plano Premium.';
  end if;
  return new;
end;
$$;

drop trigger if exists a1_guard_agent_name on public.profiles;
create trigger a1_guard_agent_name before update on public.profiles
  for each row execute function public.guard_agent_name();

-- ======== 026_assistant_history.sql ========
-- Money — 026_assistant_history.sql
-- Histórico individual das conversas da assistente (plano Premium).
-- A assistente roda no próprio app (cérebro por regras, sem IA paga): aqui só guardamos o que foi
-- perguntado e respondido. O NOME da assistente não é gravado nas mensagens (fica em profiles.agent_name,
-- sql/025): mensagens guardam só o papel (usuário/assistente), então trocar o nome nunca reescreve nem
-- apaga conversas. Rodar depois da 025.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations_own" on public.ai_conversations;
create policy "ai_conversations_own" on public.ai_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- a mensagem só pode apontar para uma conversa do próprio usuário
drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own" on public.ai_messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

-- só quem tem direito ao recurso Premium grava; limites para o histórico não crescer sem controle
create or replace function public.guard_assistant_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- servidor/migração
  end if;
  if not public.has_premium_access() then
    raise exception 'A assistente está disponível no plano Premium.';
  end if;
  if tg_table_name = 'ai_conversations' then
    if (select count(*) from public.ai_conversations where user_id = new.user_id) >= 200 then
      raise exception 'Limite de 200 conversas atingido. Apague conversas antigas para criar novas.';
    end if;
  else
    if (select count(*) from public.ai_messages where conversation_id = new.conversation_id) >= 500 then
      raise exception 'Esta conversa chegou ao limite de mensagens. Comece uma nova conversa.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a1_guard_assistant on public.ai_conversations;
create trigger a1_guard_assistant before insert on public.ai_conversations
  for each row execute function public.guard_assistant_write();

drop trigger if exists a1_guard_assistant on public.ai_messages;
create trigger a1_guard_assistant before insert on public.ai_messages
  for each row execute function public.guard_assistant_write();

-- ======== 027_fase2_seguranca_cobranca.sql ========
-- Money — 027_fase2_seguranca_cobranca.sql  (FASE 2 — aplicar primeiro em HOMOLOGAÇÃO)
-- Correções: ALTA-01 (cota), ALTA-03 (liberação de acesso atômica/idempotente), M-03 (recursos por plano no banco).
-- Idempotente (pode rodar mais de uma vez). Não altera preços, planos nem dados existentes.

-- =====================================================================================
-- 1) ALTA-01 — integridade dos campos que a cota usa (created_at e series_id)
--    O cliente NÃO decide mais a data de criação nem junta lançamentos em série alheia.
-- =====================================================================================
create or replace function public.guard_tx_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    return new; -- servidor / cron / migração
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now(); -- sempre a hora do servidor (vale a mesma hora para todo o lote da transação)
    if new.series_id is not null then
      -- uma série só pode nascer num único lote: se já existe linha dessa série criada antes, recusa
      if exists (select 1 from public.transactions t where t.series_id = new.series_id and t.created_at <> new.created_at) then
        raise exception 'Série de lançamentos inválida.';
      end if;
      select count(*) into n from public.transactions t where t.series_id = new.series_id and t.created_at = new.created_at;
      if n >= 60 then
        raise exception 'Uma série pode ter no máximo 60 ocorrências.';
      end if;
    end if;
  else -- UPDATE
    if new.created_at is distinct from old.created_at
       or new.series_id is distinct from old.series_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Esses campos do lançamento não podem ser alterados.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a0_guard_tx_integrity on public.transactions;
create trigger a0_guard_tx_integrity
  before insert or update on public.transactions
  for each row execute function public.guard_tx_integrity();

-- =====================================================================================
-- 2) M-03 — recursos por plano valem no BANCO (chamada direta à API também é barrada)
--    Mesma regra do app (src/lib/plans.ts): empréstimos >= Plus; orçamento e lembretes >= Pro.
--    Só INSERT é barrado: quem rebaixou o plano continua vendo/quitando o que já tem.
-- =====================================================================================
create or replace function public.plan_tier(p_plan text)
returns int
language sql
immutable
as $$
  select case p_plan when 'start' then 1 when 'plus' then 2 when 'pro_plan' then 3 else 4 end
$$;

create or replace function public.feature_allowed(uid uuid, min_tier int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_active
            and (p.role = 'admin'
                 or p.is_lifetime
                 or case
                      when coalesce(p.paid_until, '-infinity'::timestamptz) > now()
                        then public.plan_tier(p.plan_id) >= min_tier
                      else coalesce(p.trial_ends_at, '-infinity'::timestamptz) > now() -- teste: tudo liberado (como no app)
                    end)
     from public.profiles p where p.id = uid),
    false)
$$;
revoke execute on function public.feature_allowed(uuid, int) from public, anon, authenticated;

create or replace function public.guard_plan_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  need int := tg_argv[0]::int;
  nome text := tg_argv[1];
begin
  if auth.uid() is not null and not public.feature_allowed(auth.uid(), need) then
    raise exception 'O recurso % não está disponível no seu plano. Faça upgrade em Assinatura.', nome;
  end if;
  return new;
end;
$$;

drop trigger if exists a1_plan_feature on public.loans;
create trigger a1_plan_feature before insert on public.loans
  for each row execute function public.guard_plan_feature(2, 'Empréstimos');
drop trigger if exists a1_plan_feature on public.budgets;
create trigger a1_plan_feature before insert on public.budgets
  for each row execute function public.guard_plan_feature(3, 'Orçamento por categoria');
drop trigger if exists a1_plan_feature on public.notification_schedules;
create trigger a1_plan_feature before insert on public.notification_schedules
  for each row execute function public.guard_plan_feature(3, 'Lembretes programados');

-- =====================================================================================
-- 3) ALTA-03 — cobrança atômica, idempotente e reprocessável
--    O evento só é "concluído" na MESMA transação que libera o acesso: se algo falhar,
--    tudo é desfeito e a Kiwify reenvia. Eventos que não dá para aplicar vão para a fila
--    billing_dead_letters (nada se perde; dá para reprocessar depois).
-- =====================================================================================
create table if not exists public.billing_dead_letters (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  reason text not null,
  payload jsonb not null,
  resolved_at timestamptz
);
alter table public.billing_dead_letters enable row level security;
revoke all on public.billing_dead_letters from anon, authenticated;

-- compra aprovada / renovação
create or replace function public.kiwify_apply_grant(
  p_payment_id text, p_event text, p_email text, p_plan text, p_informed timestamptz, p_sub text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  cur timestamptz;
  base timestamptz;
  until timestamptz;
  n int;
begin
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'plano desconhecido: %', p_plan;
  end if;
  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;

  if uid is null then
    -- comprou antes de criar a conta: guarda; o cadastro aplica depois (handle_new_user)
    insert into public.billing_pending (email, plan_id, paid_until, billing_provider, billing_subscription_id)
    values (lower(p_email), p_plan,
            case when p_informed is not null and p_informed > now() then p_informed else now() + interval '1 month' end,
            'kiwify', p_sub)
    on conflict (email) do update
      set plan_id = excluded.plan_id, paid_until = excluded.paid_until,
          billing_subscription_id = excluded.billing_subscription_id;
    return 'pending';
  end if;

  insert into public.billing_events (payment_id, user_id, event) values (p_payment_id, uid, p_event)
  on conflict (payment_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    return 'duplicate';
  end if;

  select paid_until into cur from public.profiles where id = uid for update;
  base := greatest(now(), coalesce(cur, '-infinity'::timestamptz));
  until := case when p_informed is not null and p_informed > now() then p_informed else base + interval '1 month' end;

  update public.profiles
     set plan_id = p_plan, paid_until = until, billing_provider = 'kiwify',
         billing_subscription_id = p_sub, billing_status = 'active'
   where id = uid;
  if not found then
    raise exception 'perfil do usuário % não encontrado', uid; -- desfaz o evento: a Kiwify reenvia
  end if;
  return 'applied';
end;
$$;

-- reembolso / chargeback / atraso / cancelamento
create or replace function public.kiwify_apply_status(p_kind text, p_email text, p_sub text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  cur_sub text;
begin
  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;
  if uid is null then
    if p_kind = 'refund' then delete from public.billing_pending where email = lower(p_email); end if;
    return 'no_user';
  end if;
  select billing_subscription_id into cur_sub from public.profiles where id = uid;
  if p_sub is not null and cur_sub is not null and cur_sub <> p_sub then
    return 'old_subscription'; -- aviso de assinatura antiga não derruba o plano novo
  end if;
  if p_kind = 'refund' then
    update public.profiles set paid_until = now(), billing_status = 'refunded' where id = uid;
  elsif p_kind = 'late' then
    update public.profiles set billing_status = 'past_due' where id = uid;
  elsif p_kind = 'cancel' then
    update public.profiles set billing_status = 'canceled' where id = uid;
  else
    raise exception 'tipo inválido: %', p_kind;
  end if;
  return 'applied';
end;
$$;

create or replace function public.kiwify_dead_letter(p_reason text, p_payload jsonb)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.billing_dead_letters (reason, payload) values (p_reason, p_payload) returning id
$$;

revoke execute on function public.kiwify_apply_grant(text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.kiwify_apply_status(text, text, text) from public, anon, authenticated;
revoke execute on function public.kiwify_dead_letter(text, jsonb) from public, anon, authenticated;
grant execute on function public.kiwify_apply_grant(text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.kiwify_apply_status(text, text, text) to service_role;
grant execute on function public.kiwify_dead_letter(text, jsonb) to service_role;

-- ======== 028_cota_com_estorno_e_auditoria.sql ========
-- =====================================================================================
-- Money — 028 (FASE 3) — Cota mensal COM devolução ao apagar + auditoria de exclusões
-- Pré-requisito: 022 e 027 aplicadas. NÃO use a 027b (ela faz o contrário: apagar NÃO devolve).
-- Decisão do dono do produto: apagar um lançamento devolve a cota do mês.
--
-- COMO A COTA É CONTADA (regra única, no banco):
--   usado(mês) = nº de "chaves" distintas entre as linhas de `transactions` do usuário com created_at no mês (fuso BRT),
--   chave = series_id (parcelamento/recorrência conta 1, não importa quantas parcelas) ou o id (lançamento avulso).
--   Como a contagem é feita sobre as linhas que EXISTEM, apagar devolve a cota naturalmente:
--     - avulso apagado            -> devolve 1
--     - série apagada por inteiro -> devolve 1 (e não N)
--     - série apagada em parte    -> não devolve (ainda existe linha da série)
--     - lançamento de mês anterior apagado -> não devolve nada deste mês (created_at é do mês antigo)
--   created_at é do servidor e imutável (027), então o usuário não consegue "mover" um lançamento de mês.
--
-- O QUE ESTA MIGRAÇÃO ACRESCENTA
--   (a) Fecha uma brecha achada na revisão: series_id forjado = id de OUTRO lançamento fazia dois lançamentos contarem 1.
--   (b) Tabela tx_deletion_audit + gatilho: toda exclusão feita por usuário logado (inclusive em cascata ao apagar conta)
--       fica registrada. O usuário não lê nem altera o registro (só service_role).
--   (c) Visão tx_churn_report (somente service_role) para o dono do produto ver quem apaga/recria em volume.
-- =====================================================================================

-- (a) integridade: id e series_id não podem colidir entre lançamentos diferentes
create or replace function public.guard_tx_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    return new; -- servidor / cron / migração
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.series_id is not null then
      if new.series_id = new.id then
        raise exception 'Série de lançamentos inválida.';
      end if;
      -- series_id não pode ser o id de um lançamento existente (senão os dois contariam como 1)
      if exists (select 1 from public.transactions t where t.id = new.series_id) then
        raise exception 'Série de lançamentos inválida.';
      end if;
      if exists (select 1 from public.transactions t where t.series_id = new.series_id and t.created_at <> new.created_at) then
        raise exception 'Série de lançamentos inválida.';
      end if;
      select count(*) into n from public.transactions t where t.series_id = new.series_id and t.created_at = new.created_at;
      if n >= 60 then
        raise exception 'Uma série pode ter no máximo 60 ocorrências.';
      end if;
    end if;
    -- id novo não pode ser o series_id de uma série existente
    if exists (select 1 from public.transactions t where t.series_id = new.id) then
      raise exception 'Lançamento inválido.';
    end if;
  else -- UPDATE
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.series_id is distinct from old.series_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Esses campos do lançamento não podem ser alterados.';
    end if;
  end if;
  return new;
end;
$$;

-- (b) auditoria de exclusões
create table if not exists public.tx_deletion_audit (
  audit_id bigint generated always as identity primary key,
  tx_id uuid not null,
  user_id uuid not null,               -- sem FK de propósito: o registro sobrevive à exclusão do usuário
  series_id uuid,
  quota_key text not null,             -- series_id ou id (a "chave" da cota)
  type text,
  amount_cents bigint,
  tx_created_at timestamptz not null,  -- quando o lançamento foi criado (define o mês da cota)
  deleted_at timestamptz not null default now(),
  deleted_by uuid,                     -- auth.uid() de quem apagou
  counted_in_current_month boolean not null, -- o lançamento contava na cota do mês corrente?
  key_rows_remaining int not null,     -- quantas linhas da mesma chave restam depois da exclusão
  quota_returned boolean not null,     -- contava neste mês E não resta nenhuma linha da chave => cota devolvida (série: dedupe por quota_key)
  used_after int                       -- cota usada do mês logo após a exclusão (de TODO o statement)
);
create index if not exists tx_deletion_audit_user_idx on public.tx_deletion_audit (user_id, deleted_at desc);
alter table public.tx_deletion_audit enable row level security;
revoke all on public.tx_deletion_audit from anon, authenticated;

create or replace function public.audit_tx_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := coalesce(old.series_id::text, old.id::text);
  remaining int;
  counted boolean := old.created_at >= public.month_start_brt();
begin
  if auth.uid() is null then
    return null; -- limpeza de retenção (cron) e exclusão de usuário pelo servidor não entram na auditoria de ações do usuário
  end if;
  select count(*) into remaining from public.transactions t
   where t.user_id = old.user_id and coalesce(t.series_id::text, t.id::text) = k;
  insert into public.tx_deletion_audit
    (tx_id, user_id, series_id, quota_key, type, amount_cents, tx_created_at, deleted_by,
     counted_in_current_month, key_rows_remaining, quota_returned, used_after)
  values
    (old.id, old.user_id, old.series_id, k, old.type::text, old.amount_cents, old.created_at, auth.uid(),
     counted, remaining, counted and remaining = 0, public.tx_used_this_month(old.user_id));
  return null;
end;
$$;

drop trigger if exists z_tx_delete_audit on public.transactions;
create trigger z_tx_delete_audit
  after delete on public.transactions
  for each row execute function public.audit_tx_delete();

-- (c) relatório de "apaga e recria" (leitura só do dono, via service_role / SQL editor)
create or replace view public.tx_churn_report as
select user_id,
       date_trunc('month', deleted_at at time zone 'America/Sao_Paulo') as mes,
       count(distinct quota_key) filter (where quota_returned) as cotas_devolvidas,
       count(*) as linhas_apagadas
from public.tx_deletion_audit
group by 1, 2;
revoke all on public.tx_churn_report from anon, authenticated;
