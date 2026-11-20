-- Money — 027b (OPCIONAL — depende de decisão do dono do produto)
-- Problema (achado D1): apagar lançamentos devolve a cota; o usuário Start cria 25, apaga, cria mais 25, repetindo.
-- Esta opção passa a contar lançamentos CRIADOS no mês (apagar não devolve). Muda o comportamento percebido:
-- quem apaga um lançamento errado continua "gastando" 1 da cota do mês. Só aplique se concordar.
create table if not exists public.tx_quota_ledger (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,                       -- series_id ou id do lançamento (série conta 1)
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.tx_quota_ledger enable row level security;
revoke all on public.tx_quota_ledger from anon, authenticated;

-- histórico do mês corrente
insert into public.tx_quota_ledger (user_id, key, created_at)
select user_id, coalesce(series_id::text, id::text), min(created_at)
from public.transactions where created_at >= public.month_start_brt()
group by user_id, coalesce(series_id::text, id::text)
on conflict do nothing;

create or replace function public.tx_ledger_add() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.tx_quota_ledger (user_id, key) values (new.user_id, coalesce(new.series_id::text, new.id::text))
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists a2_tx_ledger on public.transactions;
create trigger a2_tx_ledger after insert on public.transactions for each row execute function public.tx_ledger_add();

create or replace function public.tx_used_this_month(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.tx_quota_ledger where user_id = uid and created_at >= public.month_start_brt()
$$;
revoke execute on function public.tx_used_this_month(uuid) from public, anon, authenticated;
