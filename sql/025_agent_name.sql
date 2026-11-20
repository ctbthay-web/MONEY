-- Money — 025_agent_name.sql
-- Nome personalizado da assistente (plano Premium). Fica no próprio perfil (profiles.agent_name):
-- já é 1 linha por usuário, já tem RLS (cada um só altera a própria linha) e não cria tabela nova.
--  * validação no banco: 2 a 20 caracteres, só letras/espaço/ponto/hífen/apóstrofo, sem espaços nas pontas;
--  * só quem tem direito ao recurso consegue gravar/alterar o nome (a tela também esconde, mas a barreira é aqui).
-- O histórico de conversas (quando existir) NÃO deve guardar o nome: guarda só quem falou (usuário/assistente)
-- e mostra o nome atual em tempo de exibição — assim trocar o nome nunca apaga nem reescreve conversas.

alter table public.profiles
  add column if not exists agent_name text;

alter table public.profiles drop constraint if exists profiles_agent_name_valid;
alter table public.profiles
  add constraint profiles_agent_name_valid check (
    agent_name is null
    or (
      agent_name = btrim(agent_name)
      and char_length(agent_name) between 2 and 20
      and agent_name ~ '^[[:alpha:]][[:alpha:] .''-]*$'
    )
  );

-- o usuário logado tem direito ao recurso Premium? (espelha effectivePlan/canUseFeature da tela)
--  admin, vitalício, ou: assinatura em dia com plano Premium (ou plano antigo, que tem tudo),
--  ou conta ainda em teste (que libera tudo).
create or replace function public.has_premium_access()
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
                        then p.plan_id not in ('start', 'plus', 'pro_plan')
                      else coalesce(p.trial_ends_at, '-infinity'::timestamptz) > now()
                    end)
     from public.profiles p
     where p.id = auth.uid()),
    false)
$$;

revoke execute on function public.has_premium_access() from public, anon;
grant execute on function public.has_premium_access() to authenticated;

create or replace function public.guard_agent_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.agent_name is distinct from old.agent_name
     and auth.uid() is not null
     and not public.has_premium_access() then
    raise exception 'A assistente personalizada está disponível no plano Premium.';
  end if;
  return new;
end;
$$;

drop trigger if exists a1_guard_agent_name on public.profiles;
create trigger a1_guard_agent_name before update on public.profiles
  for each row execute function public.guard_agent_name();
