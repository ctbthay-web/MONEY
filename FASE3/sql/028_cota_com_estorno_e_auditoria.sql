-- =====================================================================================
-- Money — 028 (FASE 3) — Cota mensal COM devolução ao apagar + auditoria de exclusões
-- Pré-requisito: 022 e 027 aplicadas. NÃO use a 027b (ela faz o contrário: apagar NÃO devolve).
-- Decisão do dono do produto: apagar um lançamento devolve a cota do mês.
--
-- COMO A COTA É CONTADA (regra única, no banco):
--   usado(mês) = nº de "chaves" distintas entre as linhas de `transactions` do usuário com created_at no mês (fuso BRT),
--   chave = series_id (parcelamento/recorrência conta 1, não importa quantas parcelas) ou o id (lançamento avulso).
--   Como a contagem é feita sobre as linhas que EXISTEM, apagar devolve a cota naturalmente:
--     - avulso apagado            -> devolve 1
--     - série apagada por inteiro -> devolve 1 (e não N)
--     - série apagada em parte    -> não devolve (ainda existe linha da série)
--     - lançamento de mês anterior apagado -> não devolve nada deste mês (created_at é do mês antigo)
--   created_at é do servidor e imutável (027), então o usuário não consegue "mover" um lançamento de mês.
--
-- O QUE ESTA MIGRAÇÃO ACRESCENTA
--   (a) Fecha uma brecha achada na revisão: series_id forjado = id de OUTRO lançamento fazia dois lançamentos contarem 1.
--   (b) Tabela tx_deletion_audit + gatilho: toda exclusão feita por usuário logado (inclusive em cascata ao apagar conta)
--       fica registrada. O usuário não lê nem altera o registro (só service_role).
--   (c) Visão tx_churn_report (somente service_role) para o dono do produto ver quem apaga/recria em volume.
-- =====================================================================================

-- (a) integridade: id e series_id não podem colidir entre lançamentos diferentes
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
    new.created_at := now();
    if new.series_id is not null then
      if new.series_id = new.id then
        raise exception 'Série de lançamentos inválida.';
      end if;
      -- series_id não pode ser o id de um lançamento existente (senão os dois contariam como 1)
      if exists (select 1 from public.transactions t where t.id = new.series_id) then
        raise exception 'Série de lançamentos inválida.';
      end if;
      if exists (select 1 from public.transactions t where t.series_id = new.series_id and t.created_at <> new.created_at) then
        raise exception 'Série de lançamentos inválida.';
      end if;
      select count(*) into n from public.transactions t where t.series_id = new.series_id and t.created_at = new.created_at;
      if n >= 60 then
        raise exception 'Uma série pode ter no máximo 60 ocorrências.';
      end if;
    end if;
    -- id novo não pode ser o series_id de uma série existente
    if exists (select 1 from public.transactions t where t.series_id = new.id) then
      raise exception 'Lançamento inválido.';
    end if;
  else -- UPDATE
    if new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.series_id is distinct from old.series_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Esses campos do lançamento não podem ser alterados.';
    end if;
  end if;
  return new;
end;
$$;

-- (b) auditoria de exclusões
create table if not exists public.tx_deletion_audit (
  audit_id bigint generated always as identity primary key,
  tx_id uuid not null,
  user_id uuid not null,               -- sem FK de propósito: o registro sobrevive à exclusão do usuário
  series_id uuid,
  quota_key text not null,             -- series_id ou id (a "chave" da cota)
  type text,
  amount_cents bigint,
  tx_created_at timestamptz not null,  -- quando o lançamento foi criado (define o mês da cota)
  deleted_at timestamptz not null default now(),
  deleted_by uuid,                     -- auth.uid() de quem apagou
  counted_in_current_month boolean not null, -- o lançamento contava na cota do mês corrente?
  key_rows_remaining int not null,     -- quantas linhas da mesma chave restam depois da exclusão
  quota_returned boolean not null,     -- contava neste mês E não resta nenhuma linha da chave => cota devolvida (série: dedupe por quota_key)
  used_after int                       -- cota usada do mês logo após a exclusão (de TODO o statement)
);
create index if not exists tx_deletion_audit_user_idx on public.tx_deletion_audit (user_id, deleted_at desc);
alter table public.tx_deletion_audit enable row level security;
revoke all on public.tx_deletion_audit from anon, authenticated;

create or replace function public.audit_tx_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := coalesce(old.series_id::text, old.id::text);
  remaining int;
  counted boolean := old.created_at >= public.month_start_brt();
begin
  if auth.uid() is null then
    return null; -- limpeza de retenção (cron) e exclusão de usuário pelo servidor não entram na auditoria de ações do usuário
  end if;
  select count(*) into remaining from public.transactions t
   where t.user_id = old.user_id and coalesce(t.series_id::text, t.id::text) = k;
  insert into public.tx_deletion_audit
    (tx_id, user_id, series_id, quota_key, type, amount_cents, tx_created_at, deleted_by,
     counted_in_current_month, key_rows_remaining, quota_returned, used_after)
  values
    (old.id, old.user_id, old.series_id, k, old.type::text, old.amount_cents, old.created_at, auth.uid(),
     counted, remaining, counted and remaining = 0, public.tx_used_this_month(old.user_id));
  return null;
end;
$$;

drop trigger if exists z_tx_delete_audit on public.transactions;
create trigger z_tx_delete_audit
  after delete on public.transactions
  for each row execute function public.audit_tx_delete();

-- (c) relatório de "apaga e recria" (leitura só do dono, via service_role / SQL editor)
create or replace view public.tx_churn_report as
select user_id,
       date_trunc('month', deleted_at at time zone 'America/Sao_Paulo') as mes,
       count(distinct quota_key) filter (where quota_returned) as cotas_devolvidas,
       count(*) as linhas_apagadas
from public.tx_deletion_audit
group by 1, 2;
revoke all on public.tx_churn_report from anon, authenticated;
