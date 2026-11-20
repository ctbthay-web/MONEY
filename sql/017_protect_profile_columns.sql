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
