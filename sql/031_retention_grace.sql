-- Money — 031_retention_grace.sql
-- Carência de 3 MESES na limpeza de retenção (cleanup_old_transactions).
-- Antes: assim que a assinatura vencia, a conta passava a ter só 6 meses de histórico na limpeza do dia 1;
-- quem cancelava e voltava dias depois (Premium/Pro) podia perder o histórico antigo.
-- Agora: a assinatura vencida continua contando como "em dia" para a retenção por 3 meses depois do vencimento
-- (Premium: nunca apaga; Pro: 24 meses; demais: 6 meses). Passados os 3 meses sem renovar (assinatura vencida
-- ou conta abandonada), a conta entra na limpeza normal (6 meses). Vitalício e admin nunca são apagados.
-- Continua sem mexer no saldo (money.skip_balance) e preservando o que ainda não foi quitado.
-- Esta migração só troca a regra; NÃO executa a limpeza.

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
    -- Premium (em dia ou vencido ha menos de 3 meses), vitalicio e admin: nunca apaga
    and not (
      p.role = 'admin'
      or p.is_lifetime
      or (p.plan_id = 'premium' and coalesce(p.paid_until, '-infinity'::timestamptz) > now() - interval '3 months')
    )
    -- Pro (em dia ou vencido ha menos de 3 meses): 24 meses; demais: 6 meses
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
    );
  get diagnostics deleted_count = row_count;

  perform set_config('money.skip_balance', 'off', true);
  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_old_transactions() from public, anon, authenticated;
