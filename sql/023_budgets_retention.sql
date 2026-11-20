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
