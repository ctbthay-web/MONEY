-- Desfaz a 028 (a cota continua COM devolução, como na 022/027). Não apaga a auditoria (preserva o histórico).
drop trigger if exists z_tx_delete_audit on public.transactions;
drop function if exists public.audit_tx_delete();
drop view if exists public.tx_churn_report;
-- volta o guard da 027 (sem os checks de colisão id/series_id): reaplique a função guard_tx_integrity() do arquivo 027.
-- (a tabela tx_deletion_audit é mantida de propósito; apague manualmente só se decidir descartar o histórico)
