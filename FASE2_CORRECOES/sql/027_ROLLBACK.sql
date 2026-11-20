-- Reversão da 027 (não apaga dados). Use só se a 027 causar problema; as falhas ALTA voltam a existir.
drop trigger if exists a0_guard_tx_integrity on public.transactions;
drop trigger if exists a1_plan_feature on public.loans;
drop trigger if exists a1_plan_feature on public.budgets;
drop trigger if exists a1_plan_feature on public.notification_schedules;
drop trigger if exists a2_tx_ledger on public.transactions;
drop function if exists public.guard_tx_integrity();
drop function if exists public.guard_plan_feature();
drop function if exists public.feature_allowed(uuid, int);
drop function if exists public.plan_tier(text);
drop function if exists public.tx_ledger_add();
drop function if exists public.kiwify_apply_grant(text, text, text, text, timestamptz, text);
drop function if exists public.kiwify_apply_status(text, text, text);
drop function if exists public.kiwify_dead_letter(text, jsonb);
-- 027b: se aplicada, volte a contagem original:
create or replace function public.tx_used_this_month(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct coalesce(series_id::text, id::text))::int
  from public.transactions where user_id = uid and created_at >= public.month_start_brt()
$$;
revoke execute on function public.tx_used_this_month(uuid) from public, anon, authenticated;
-- (as tabelas billing_dead_letters e tx_quota_ledger são mantidas de propósito: guardam dados)
