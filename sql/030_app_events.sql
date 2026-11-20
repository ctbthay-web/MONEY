-- Money — 030_app_events.sql
-- Medição própria (sem serviço externo, sem cookies de terceiros): funil de vendas e erros do app.
--  * app_events: visita, clique no plano, cadastro, ida ao pagamento e erros de tela. Cada visitante tem um
--    identificador aleatório guardado no navegador (sem nome, e-mail ou dados financeiros nos eventos).
--  * Qualquer pessoa pode GRAVAR um evento (anon/authenticated); ninguém além do admin consegue LER
--    (não há policy de select; leitura só pelas funções admin_funnel / admin_recent_errors, que checam is_admin()).
--  * Retenção: eventos com mais de 90 dias são apagados (cleanup_app_events, agendado se pg_cron existir).
-- Rodar depois da 029.

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('page', 'funnel', 'error')),
  name text not null check (char_length(name) between 1 and 60),
  anon_id text check (anon_id is null or char_length(anon_id) between 8 and 64),
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  path text check (path is null or char_length(path) <= 200),
  plan_id text check (plan_id is null or char_length(plan_id) <= 20),
  meta jsonb check (meta is null or pg_column_size(meta) <= 1500)
);

create index if not exists app_events_created_idx on public.app_events (created_at desc);
create index if not exists app_events_name_idx on public.app_events (name, created_at desc);

alter table public.app_events enable row level security;

drop policy if exists "app_events_insert" on public.app_events;
create policy "app_events_insert" on public.app_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

revoke all on public.app_events from anon, authenticated;
grant insert on public.app_events to anon, authenticated;

-- ---------- leitura só para admin ----------
create or replace function public.admin_funnel(p_days int default 30)
returns table (name text, events bigint, visitors bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select e.name, count(*)::bigint, count(distinct coalesce(e.anon_id, e.user_id::text))::bigint
    from public.app_events e
    where e.kind in ('page', 'funnel')
      and e.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
    group by e.name;
end;
$$;

create or replace function public.admin_recent_errors(p_limit int default 30)
returns table (created_at timestamptz, name text, path text, plan_id text, meta jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select e.created_at, e.name, e.path, e.plan_id, e.meta
    from public.app_events e
    where e.kind = 'error'
    order by e.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 200));
end;
$$;

revoke execute on function public.admin_funnel(int) from public, anon;
revoke execute on function public.admin_recent_errors(int) from public, anon;
grant execute on function public.admin_funnel(int) to authenticated;
grant execute on function public.admin_recent_errors(int) to authenticated;

-- ---------- retenção ----------
create or replace function public.cleanup_app_events()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.app_events where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.cleanup_app_events() from public, anon, authenticated;

-- agenda (todo dia 2, 03:30) só se o pg_cron estiver habilitado; senão, não faz nada
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('money-cleanup-app-events', '30 3 2 * *', 'select public.cleanup_app_events()');
  end if;
exception when others then
  null;
end;
$$;
