
-- ===== 027_invoice_closing_day.sql =====
-- Money — 027_invoice_closing_day.sql
-- Regra do fechamento da fatura: compra NO dia do fechamento (ou depois) já cai na fatura seguinte.
-- Ex.: fechamento dia 1 → compras de 01/10 a 31/10 entram na fatura que fecha em 01/11.
-- (antes, o próprio dia do fechamento ainda entrava na fatura que estava fechando: `<=`; agora é `<`).
-- O front (src/lib/invoices.ts) e os avisos (api/_lib/notifications.js) já usam a regra nova; aqui só a
-- limpeza de histórico (cleanup_old_transactions, versão da 023) precisa concordar sobre qual fatura
-- cada compra pertence, para nunca apagar compra de fatura ainda não paga. Rodar depois da 026.

create or replace function public.cleanup_old_transactions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  perform set_config('money.skip_balance', 'on', true);

  delete from public.transactions t
  using public.accounts a, public.profiles p
  where a.id = t.account_id
    and p.id = t.user_id
    -- Premium (assinatura em dia), vitalício e admin: nunca apaga
    and not (
      p.role = 'admin'
      or p.is_lifetime
      or (p.plan_id = 'premium' and coalesce(p.paid_until, '-infinity'::timestamptz) > now())
    )
    -- Pro (assinatura em dia): 24 meses; demais: 6 meses
    and t.date < current_date - make_interval(
      months => case
        when p.plan_id = 'pro_plan' and coalesce(p.paid_until, '-infinity'::timestamptz) > now() then 24
        else 6
      end
    )
    and (
      (a.type <> 'credit_card' and t.applied_to_balance)
      or (
        a.type = 'credit_card'
        and exists (
          select 1 from public.transfers tr
          where tr.to_account_id = a.id
            and tr.invoice_period = case
              when a.closing_day is null then to_char(t.date, 'YYYY-MM')
              when extract(day from t.date) < a.closing_day then to_char(t.date, 'YYYY-MM')
              else to_char(t.date + interval '1 month', 'YYYY-MM')
            end
        )
      )
    );
  get diagnostics deleted_count = row_count;

  perform set_config('money.skip_balance', 'off', true);
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_old_transactions() from public, anon, authenticated;

-- ===== 028_loan_payment_account.sql =====
-- Money — 028_loan_payment_account.sql
-- Escolher EM QUAL CONTA o pagamento/recebimento de um empréstimo cai.
-- Antes, todo pagamento mexia só na conta onde o empréstimo foi lançado. Agora cada pagamento pode ter a
-- própria conta (loan_payments.account_id); sem conta informada (pagamentos antigos), vale a do empréstimo.
--  * apply_loan_payment_to_balance: usa a conta do pagamento (ou a do empréstimo);
--  * apply_loan_to_balance (editar/excluir empréstimo): desfaz/reaplica cada pagamento na conta onde ele caiu;
--  * check_row_ownership: a conta do pagamento tem que ser do próprio usuário.
-- Rodar depois da 027.

alter table public.loan_payments
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

-- ---------- saldo: pagamento na conta escolhida ----------
create or replace function public.apply_loan_payment_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_direction text;
  loan_account uuid;
  target uuid;
  delta bigint;
begin
  if tg_op = 'INSERT' then
    select direction, account_id into loan_direction, loan_account from public.loans where id = new.loan_id;
    target := coalesce(new.account_id, loan_account);
    delta := case when loan_direction = 'lent' then new.amount_cents else -new.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = target;
    return new;
  elsif tg_op = 'DELETE' then
    select direction, account_id into loan_direction, loan_account from public.loans where id = old.loan_id;
    if not found then
      -- exclusão em cascata do empréstimo: o saldo já foi desfeito no BEFORE DELETE do empréstimo
      return old;
    end if;
    target := coalesce(old.account_id, loan_account);
    delta := case when loan_direction = 'lent' then -old.amount_cents else old.amount_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = target;
    return old;
  end if;
  return null;
end;
$$;

-- ---------- saldo: editar/excluir empréstimo com pagamentos em contas diferentes ----------
create or replace function public.apply_loan_to_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta bigint;
  paid_total bigint;
  paid_old bigint;
  p record;
begin
  if tg_op = 'INSERT' then
    delta := case when new.direction = 'lent' then -new.principal_cents else new.principal_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;
    return new;

  elsif tg_op = 'UPDATE' then
    if new.principal_cents is not distinct from old.principal_cents
       and new.direction is not distinct from old.direction
       and new.account_id is not distinct from old.account_id then
      return new;
    end if;

    select coalesce(sum(amount_cents), 0) into paid_total from public.loan_payments where loan_id = new.id;
    if new.principal_cents < paid_total then
      raise exception 'O valor não pode ser menor que o já devolvido.';
    end if;

    -- pagamentos que estão na conta do empréstimo acompanham o empréstimo se a conta mudar
    select coalesce(sum(amount_cents), 0) into paid_old
      from public.loan_payments
      where loan_id = new.id and coalesce(account_id, old.account_id) = old.account_id;

    delta := case when old.direction = 'lent' then old.principal_cents - paid_old else -old.principal_cents + paid_old end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    delta := case when new.direction = 'lent' then -new.principal_cents + paid_old else new.principal_cents - paid_old end;
    update public.accounts set balance_cents = balance_cents + delta where id = new.account_id;

    if new.account_id is distinct from old.account_id then
      update public.loan_payments
        set account_id = new.account_id
        where loan_id = new.id and coalesce(account_id, old.account_id) = old.account_id;
    end if;

    -- pagamentos em OUTRAS contas ficam onde estão; só se o sentido (emprestei/peguei) mudou, o efeito inverte
    if new.direction is distinct from old.direction then
      for p in
        select amount_cents, account_id from public.loan_payments
        where loan_id = new.id and account_id is not null and account_id <> new.account_id
      loop
        delta := case when old.direction = 'lent' then -p.amount_cents else p.amount_cents end
               + case when new.direction = 'lent' then p.amount_cents else -p.amount_cents end;
        update public.accounts set balance_cents = balance_cents + delta where id = p.account_id;
      end loop;
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    -- roda em BEFORE DELETE: os pagamentos ainda existem. Desfaz a concessão na conta do empréstimo
    -- e cada pagamento na conta em que ele caiu.
    delta := case when old.direction = 'lent' then old.principal_cents else -old.principal_cents end;
    update public.accounts set balance_cents = balance_cents + delta where id = old.account_id;
    for p in select amount_cents, account_id from public.loan_payments where loan_id = old.id loop
      delta := case when old.direction = 'lent' then -p.amount_cents else p.amount_cents end;
      update public.accounts set balance_cents = balance_cents + delta where id = coalesce(p.account_id, old.account_id);
    end loop;
    return old;
  end if;
  return null;
end;
$$;

-- ---------- dono das referências (inclui a conta do pagamento) ----------
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
  end if;

  if not ok then
    raise exception 'Referência inválida: o item não pertence a você.';
  end if;
  return new;
end;
$$;

-- ===== 029_recurrences.sql =====
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
