-- Money — 029_recurrences.sql
-- Recorrências com valor FIXO, VARIÁVEL ou POR OCORRÊNCIA.
--  * recurrences: o cadastro da recorrência (periodicidade, modalidade, situação). Antes só existiam linhas soltas
--    ligadas por series_id; agora a série antiga pode ser "adotada" sem mexer em nenhuma movimentação
--    (recurrences.series_id aponta para o series_id das linhas; transactions NÃO é alterada).
--  * valor variável / por ocorrência: as próximas ocorrências NÃO viram linhas em transactions — são previsões
--    calculadas no app. Só viram movimentação quando o usuário informa o valor (transactions.recurrence_id +
--    recurrence_date, com índice único para impedir duplicidade).
--  * skipped_dates: ocorrências que o usuário escolheu pular.
-- Previsão nunca é saldo nem despesa realizada: não existe linha em transactions até o usuário lançar.
-- Rodar depois da 028.

create table if not exists public.recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  mode text not null check (mode in ('fixed', 'variable', 'per_occurrence')),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- fixed: valor; variable: valor base usado quando ainda não há histórico; per_occurrence: não usado
  amount_cents bigint check (amount_cents is null or amount_cents > 0),
  -- data da primeira ocorrência (define o dia do mês / da semana)
  anchor_date date not null,
  -- as previsões só existem a partir desta data (reativar uma recorrência pausada não gera atrasos antigos)
  active_from date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended', 'dismissed')),
  ended_at date,
  source text not null default 'manual' check (source in ('manual', 'legacy', 'detected')),
  -- série antiga (valor fixo) adotada por esta recorrência
  series_id uuid,
  skipped_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recurrences_series_id_uidx on public.recurrences (series_id) where series_id is not null;
create index if not exists recurrences_user_idx on public.recurrences (user_id);

alter table public.recurrences enable row level security;

drop policy if exists "recurrences_own" on public.recurrences;
create policy "recurrences_own" on public.recurrences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sem acesso (assinatura encerrada) o banco recusa gravar, como nas demais tabelas
drop trigger if exists a00_paywall on public.recurrences;
create trigger a00_paywall before insert or update or delete on public.recurrences
  for each row execute function public.paywall_check();

-- ---------- ligação opcional de uma movimentação a uma ocorrência ----------
alter table public.transactions
  add column if not exists recurrence_id uuid references public.recurrences (id) on delete set null,
  add column if not exists recurrence_date date;

-- cada ocorrência (recorrência + data esperada) só pode virar UMA movimentação
create unique index if not exists transactions_recurrence_occurrence_uidx
  on public.transactions (recurrence_id, recurrence_date)
  where recurrence_id is not null and recurrence_date is not null;

-- ---------- dono das referências ----------
create or replace function public.check_row_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean := true;
begin
  if tg_table_name = 'transactions' then
    ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    if ok and new.category_id is not null then
      ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
    end if;
    if ok and new.recurrence_id is not null then
      ok := exists (select 1 from public.recurrences where id = new.recurrence_id and user_id = new.user_id);
    end if;
  elsif tg_table_name = 'transfers' then
    ok := exists (select 1 from public.accounts where id = new.from_account_id and user_id = new.user_id)
      and exists (select 1 from public.accounts where id = new.to_account_id and user_id = new.user_id);
  elsif tg_table_name = 'loans' then
    ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
  elsif tg_table_name = 'loan_payments' then
    ok := exists (select 1 from public.loans where id = new.loan_id and user_id = new.user_id);
    if ok and new.account_id is not null then
      ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    end if;
  elsif tg_table_name = 'goal_contributions' then
    ok := exists (select 1 from public.goals where id = new.goal_id and user_id = new.user_id);
  elsif tg_table_name = 'budgets' then
    ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
  elsif tg_table_name = 'recurrences' then
    ok := exists (select 1 from public.accounts where id = new.account_id and user_id = new.user_id);
    if ok and new.category_id is not null then
      ok := exists (select 1 from public.categories where id = new.category_id and (user_id is null or user_id = new.user_id));
    end if;
    -- a série adotada tem que ser de movimentações do próprio usuário
    if ok and new.series_id is not null then
      ok := exists (select 1 from public.transactions where series_id = new.series_id and user_id = new.user_id)
        or not exists (select 1 from public.transactions where series_id = new.series_id);
    end if;
  end if;

  if not ok then
    raise exception 'Referência inválida: o item não pertence a você.';
  end if;
  return new;
end;
$$;

drop trigger if exists a0_check_ownership on public.recurrences;
create trigger a0_check_ownership before insert or update on public.recurrences
  for each row execute function public.check_row_ownership();
