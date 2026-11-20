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
