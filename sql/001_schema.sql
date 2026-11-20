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
