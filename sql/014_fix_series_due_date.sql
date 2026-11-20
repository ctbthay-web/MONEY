-- Money — 014_fix_series_due_date.sql
-- Corrige séries (parcelado/recorrente) criadas quando o vencimento era copiado igual para
-- todas as parcelas. Só mexe em séries com mais de uma linha em que TODAS têm o mesmo due_date
-- (assinatura do erro); o vencimento passa a acompanhar a parcela: due_date + (n-1) períodos.
-- due_date é informativo (não entra no trigger de saldo), então não altera nenhum saldo.

update public.transactions t
set due_date = case coalesce(t.recurrence_frequency, 'monthly')
  when 'weekly' then t.due_date + ((t.installment_number - 1) * 7)
  when 'yearly' then (t.due_date + make_interval(years => t.installment_number - 1))::date
  else (t.due_date + make_interval(months => t.installment_number - 1))::date
end
where t.series_id in (
  select series_id from public.transactions
  where series_id is not null and due_date is not null
  group by series_id
  having count(*) > 1 and count(distinct due_date) = 1
)
and t.installment_number > 1;
