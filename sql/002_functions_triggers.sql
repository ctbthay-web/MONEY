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
