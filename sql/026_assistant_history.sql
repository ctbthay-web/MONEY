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
