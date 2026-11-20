-- Money — 016_retention_keeps_unpaid.sql
-- A limpeza de retenção (mais de 6 meses) passa a preservar o que ainda não foi quitado:
-- - conta comum: só apaga o que já foi confirmado (applied_to_balance = true);
-- - compra no cartão de crédito: só apaga se a fatura dela já foi paga (existe transfer com o
--   invoice_period dela para aquele cartão; o período segue a mesma regra do app: dia da compra
--   > fechamento => fatura do mês seguinte; sem fechamento cadastrado => mês da compra).
-- Continua sem mexer no saldo (flag money.skip_balance, ver 015).

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
  using public.accounts a
  where a.id = t.account_id
    and t.date < (current_date - interval '6 months')
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
