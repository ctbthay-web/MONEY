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
