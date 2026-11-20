-- Money — dados FICTÍCIOS para homologação. Rode SOMENTE no Supabase de HOMOLOGAÇÃO (nunca em produção).
-- Antes: crie os usuários A e B (scripts/seed-homologacao.mjs ou Authentication > Users, e-mails terminados em .test).
-- Uso:   select public.seed_homologacao('usuario.a@money-homolog.test', 'A');
--        select public.seed_homologacao('usuario.b@money-homolog.test', 'B');
-- Cada usuário recebe dados com marcador [HOMOLOG X] na descrição: se o marcador de A aparecer para B, houve vazamento.
create or replace function public.seed_homologacao(p_email text, p_marker text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid; conta uuid; cartao uuid; cat_exp uuid; cat_inc uuid; sid uuid := gen_random_uuid();
begin
  if p_email !~* '@[^@]+\.test$' then raise exception 'RECUSADO: use e-mail fictício terminado em .test'; end if;
  if p_marker !~ '^[A-Z]$' then raise exception 'marcador deve ser uma letra'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'usuário % não existe; crie-o antes', p_email; end if;
  if exists (select 1 from public.transactions where user_id = uid and description like '[HOMOLOG %') then
    return 'já semeado'; -- idempotente
  end if;

  select id into cat_exp from public.categories where type = 'expense' order by name limit 1;
  select id into cat_inc from public.categories where type = 'income' order by name limit 1;

  insert into public.accounts (user_id, name, type, balance_cents) values (uid, 'Conta Corrente [HOMOLOG '||p_marker||']', 'checking', 500000) returning id into conta;
  insert into public.accounts (user_id, name, type, closing_day, due_day) values (uid, 'Cartão [HOMOLOG '||p_marker||']', 'credit_card', 25, 5) returning id into cartao;

  insert into public.transactions (user_id, account_id, category_id, type, amount_cents, description, applied_to_balance)
  values (uid, conta, cat_inc, 'income', 300000, '[HOMOLOG '||p_marker||'] Salário fictício', true),
         (uid, conta, cat_exp, 'expense', 12000, '[HOMOLOG '||p_marker||'] Mercado fictício', true),
         (uid, conta, cat_exp, 'expense', 4500,  '[HOMOLOG '||p_marker||'] Transporte fictício', true);
  -- parcelamento (1 lote, mesmo series_id) e compra no cartão
  insert into public.transactions (user_id, account_id, category_id, type, amount_cents, description, series_id)
  select uid, conta, cat_exp, 'expense', 10000, '[HOMOLOG '||p_marker||'] Parcela '||g||'/6', sid from generate_series(1,6) g;
  insert into public.transactions (user_id, account_id, category_id, type, amount_cents, description)
  values (uid, cartao, cat_exp, 'expense', 25000, '[HOMOLOG '||p_marker||'] Compra no cartão fictícia');

  insert into public.goals (user_id, name, target_cents, accumulated_cents) values (uid, 'Meta [HOMOLOG '||p_marker||']', 1000000, 150000);
  insert into public.loans (user_id, account_id, counterparty, direction, principal_cents) values (uid, conta, 'Fulano [HOMOLOG '||p_marker||']', 'lent', 20000);
  if cat_exp is not null then
    insert into public.budgets (user_id, category_id, amount_cents) values (uid, cat_exp, 80000) on conflict do nothing;
  end if;
  return 'semeado: ' || p_email;
end;
$$;
revoke execute on function public.seed_homologacao(text, text) from public, anon, authenticated;
