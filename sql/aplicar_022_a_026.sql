
-- ===== 022_plans_kiwify.sql =====
-- Money — 022_plans_kiwify.sql
-- Planos pagos (Start, Plus, Pro, Premium) vendidos pela Kiwify.
--  * limite de lançamentos por mês aplicado NO BANCO (constraint trigger no fim da transação);
--  * função tx_usage() para o app mostrar "x de N lançamentos";
--  * billing_pending: compra feita na Kiwify com e-mail que ainda não tem conta — o plano é
--    aplicado quando a conta com esse e-mail for criada;
--  * find_user_id_by_email(): só o servidor (service role) usa, para o webhook da Kiwify.
-- Quem está em teste grátis, é vitalício/admin ou assina o plano antigo ('pro', 12,90 sem limite)
-- continua sem limite.

insert into public.plans (id, name, price_cents, limits) values
  ('start',    'Start',    1990, '{"max_transactions_per_month": 25}'::jsonb),
  ('plus',     'Plus',     2990, '{"max_transactions_per_month": 50}'::jsonb),
  ('pro_plan', 'Pro',      3990, '{"max_transactions_per_month": 70}'::jsonb),
  ('premium', 'Premium', 5990, '{}'::jsonb)
on conflict (id) do update
  set name = excluded.name, price_cents = excluded.price_cents, limits = excluded.limits;

-- ---------- limite mensal ----------
-- início do mês corrente no horário de Brasília
create or replace function public.month_start_brt()
returns timestamptz
language sql
stable
as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- limite de lançamentos/mês do usuário (null = sem limite)
create or replace function public.tx_month_limit(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role = 'admin' or p.is_lifetime then null
    when coalesce(p.paid_until, '-infinity'::timestamptz) > now() then
      (select (pl.limits ->> 'max_transactions_per_month')::int from public.plans pl where pl.id = p.plan_id)
    else null -- teste grátis (ou sem acesso: quem barra é o paywall)
  end
  from public.profiles p
  where p.id = uid
$$;

-- lançamentos do mês: parcelamento/recorrência (mesmo series_id) conta como UM lançamento
create or replace function public.tx_used_this_month(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(series_id::text, id::text))::int
  from public.transactions
  where user_id = uid and created_at >= public.month_start_brt()
$$;

revoke execute on function public.tx_month_limit(uuid) from public, anon, authenticated;
revoke execute on function public.tx_used_this_month(uuid) from public, anon, authenticated;

create or replace function public.tx_usage()
returns table (used int, lim int)
language sql
stable
security definer
set search_path = public
as $$
  select public.tx_used_this_month(auth.uid()), public.tx_month_limit(auth.uid())
$$;

revoke execute on function public.tx_usage() from public, anon;
grant execute on function public.tx_usage() to authenticated;

-- confere no FIM da transação (vê o lote inteiro: importação de fatura, parcelamento etc.)
create or replace function public.check_tx_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
begin
  if auth.uid() is null then
    return null; -- servidor/cron/migração
  end if;
  lim := public.tx_month_limit(new.user_id);
  if lim is not null and public.tx_used_this_month(new.user_id) > lim then
    raise exception 'Você chegou ao limite de % lançamentos por mês do seu plano. Faça upgrade em Assinatura para continuar.', lim;
  end if;
  return null;
end;
$$;

drop trigger if exists z_tx_quota on public.transactions;
create constraint trigger z_tx_quota
  after insert on public.transactions
  deferrable initially deferred
  for each row execute function public.check_tx_quota();

-- ---------- compra na Kiwify antes de ter conta ----------
create table if not exists public.billing_pending (
  email text primary key,
  plan_id text not null references public.plans (id),
  paid_until timestamptz not null,
  billing_provider text not null default 'kiwify',
  billing_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.billing_pending enable row level security;
revoke all on public.billing_pending from anon, authenticated;

-- id do usuário pelo e-mail (só service role)
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- cadastro novo: 7 dias de teste + aplica compra pendente feita com o mesmo e-mail
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
    now() + interval '7 days'
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

-- ===== 023_budgets_retention.sql =====
-- Money — 023_budgets_retention.sql
--  * budgets: orçamento mensal por categoria (plano Pro em diante; liberação por plano é na tela);
--  * notification_preferences.notify_budgets: avisos aos 80% e ao estourar o orçamento;
--  * retenção por plano: Pro guarda 24 meses, Premium/vitalício/admin nunca apagam, os demais 6 meses.
-- Rodar depois da 022.

-- ---------- orçamento por categoria ----------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.budgets enable row level security;

drop policy if exists "budgets_own" on public.budgets;
create policy "budgets_own" on public.budgets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sem acesso (teste/assinatura encerrados) o banco recusa gravar, como nas demais tabelas
drop trigger if exists a00_paywall on public.budgets;
create trigger a00_paywall before insert or update or delete on public.budgets
  for each row execute function public.paywall_check();

-- a categoria apontada tem que ser do próprio usuário (ou padrão do sistema); mesma função da 018
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

drop trigger if exists a0_check_ownership on public.budgets;
create trigger a0_check_ownership before insert or update on public.budgets
  for each row execute function public.check_row_ownership();

-- ---------- aviso de orçamento ----------
alter table public.notification_preferences
  add column if not exists notify_budgets boolean not null default true;

-- ---------- retenção por plano ----------
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
              when extract(day from t.date) <= a.closing_day then to_char(t.date, 'YYYY-MM')
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

-- ===== 024_no_trial.sql =====
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

-- ===== 025_agent_name.sql =====
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

-- ===== 026_assistant_history.sql =====
-- Money — 026_assistant_history.sql
-- Histórico individual das conversas da assistente (plano Premium).
-- A assistente roda no próprio app (cérebro por regras, sem IA paga): aqui só guardamos o que foi
-- perguntado e respondido. O NOME da assistente não é gravado nas mensagens (fica em profiles.agent_name,
-- sql/025): mensagens guardam só o papel (usuário/assistente), então trocar o nome nunca reescreve nem
-- apaga conversas. Rodar depois da 025.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations_own" on public.ai_conversations;
create policy "ai_conversations_own" on public.ai_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- a mensagem só pode apontar para uma conversa do próprio usuário
drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own" on public.ai_messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

-- só quem tem direito ao recurso Premium grava; limites para o histórico não crescer sem controle
create or replace function public.guard_assistant_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- servidor/migração
  end if;
  if not public.has_premium_access() then
    raise exception 'A assistente está disponível no plano Premium.';
  end if;
  if tg_table_name = 'ai_conversations' then
    if (select count(*) from public.ai_conversations where user_id = new.user_id) >= 200 then
      raise exception 'Limite de 200 conversas atingido. Apague conversas antigas para criar novas.';
    end if;
  else
    if (select count(*) from public.ai_messages where conversation_id = new.conversation_id) >= 500 then
      raise exception 'Esta conversa chegou ao limite de mensagens. Comece uma nova conversa.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a1_guard_assistant on public.ai_conversations;
create trigger a1_guard_assistant before insert on public.ai_conversations
  for each row execute function public.guard_assistant_write();

drop trigger if exists a1_guard_assistant on public.ai_messages;
create trigger a1_guard_assistant before insert on public.ai_messages
  for each row execute function public.guard_assistant_write();
