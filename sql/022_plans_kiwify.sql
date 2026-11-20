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
