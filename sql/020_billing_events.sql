-- Money — 020_billing_events.sql
-- Registro dos pagamentos já processados pelo webhook do Asaas. A chave primária em
-- payment_id garante que o mesmo pagamento nunca estende o acesso duas vezes (o Asaas pode
-- reenviar o aviso, e cartão dispara CONFIRMED e depois RECEIVED). RLS ligado e SEM policies:
-- só o servidor (service role) lê/grava; nenhum usuário enxerga.

create table if not exists public.billing_events (
  payment_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null,
  created_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
