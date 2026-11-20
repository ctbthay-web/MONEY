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
