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
