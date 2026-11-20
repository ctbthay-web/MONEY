-- Money — 032_retention_abandoned_delete_all.sql  (continua a 031)
-- DECISÃO DO USUÁRIO: conta ABANDONADA tem TODOS os lançamentos apagados pela limpeza mensal (dia 1, 03:00).
-- Abandonada = o último direito de acesso (maior entre: fim do pagamento, fim do teste grátis e criação da conta) venceu há
-- MAIS de 3 meses. Quem está pagando (mesmo sem usar o app) ou venceu há menos de 3 meses NÃO é abandonado: mantém o
-- histórico do plano (Start/Plus 6 meses, Pro 24, Premium ilimitado), como na 031. Vitalício e admin nunca são apagados.
-- Apaga só os LANÇAMENTOS (transactions): login, contas, categorias, metas, empréstimos e saldos permanecem (sem mexer no
-- saldo: money.skip_balance). Esta migração só troca a regra; NÃO executa a limpeza.

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
    and not (p.role = 'admin' or p.is_lifetime)
    and (
      -- 1) conta abandonada (sem acesso ha mais de 3 meses): apaga todos os lancamentos
      greatest(
        coalesce(p.paid_until, '-infinity'::timestamptz),
        coalesce(p.trial_ends_at, '-infinity'::timestamptz),
        p.created_at
      ) <= now() - interval '3 months'
      -- 2) demais contas: retencao do plano (Premium nunca; Pro 24 meses; demais 6 meses), so o ja quitado
      or (
        not (p.plan_id = 'premium' and coalesce(p.paid_until, '-infinity'::timestamptz) > now() - interval '3 months')
        and t.date < current_date - make_interval(
          months => case
            when p.plan_id = 'pro_plan' and coalesce(p.paid_until, '-infinity'::timestamptz) > now() - interval '3 months' then 24
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
        )
      )
    );
  get diagnostics deleted_count = row_count;

  perform set_config('money.skip_balance', 'off', true);
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_old_transactions() from public, anon, authenticated;
