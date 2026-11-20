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
