-- Money — 021_notifications.sql
-- Notificações push: preferências, aparelhos inscritos, programações do usuário e histórico.
-- Isolamento por usuário via RLS. O servidor (service role, função /api/notify-run) envia.
-- Sem linha em notification_preferences = notificações ATIVADAS (padrão para todo usuário novo).

-- ---------- preferências ----------
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  notify_due boolean not null default true,         -- contas a pagar (vencendo / atrasadas)
  notify_receivable boolean not null default true,  -- recebimentos previstos
  notify_cards boolean not null default true,       -- faturas de cartão
  notify_goals boolean not null default true,       -- metas (25/50/80/100%)
  notify_summary boolean not null default true,     -- resumo do mês
  days_before smallint not null default 1 check (days_before between 0 and 7),
  send_hour smallint not null default 9 check (send_hour between 0 and 23), -- horário de Brasília
  updated_at timestamptz not null default now()
);

-- ---------- aparelhos inscritos (Web Push) ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------- programações do usuário ----------
create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  message text check (message is null or char_length(message) <= 200),
  frequency text not null check (frequency in ('once', 'daily', 'weekly', 'monthly')),
  start_date date not null,            -- 1ª data (ou a data única); semanal/mensal repetem a partir dela
  send_time time not null default '09:00',
  active boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now()
);
create index if not exists notification_schedules_user_idx on public.notification_schedules (user_id);

-- ---------- histórico / anti-duplicidade ----------
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notification_log_user_idx on public.notification_log (user_id, created_at desc);

-- ---------- RLS ----------
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_schedules enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own" on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subs_own" on public.push_subscriptions;
create policy "push_subs_own" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notif_schedules_own" on public.notification_schedules;
create policy "notif_schedules_own" on public.notification_schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- histórico: o usuário só lê o próprio; quem grava é o servidor (service role)
drop policy if exists "notif_log_select_own" on public.notification_log;
create policy "notif_log_select_own" on public.notification_log
  for select using (user_id = auth.uid());
revoke insert, update, delete on public.notification_log from anon, authenticated;
