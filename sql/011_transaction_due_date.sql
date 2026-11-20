-- Money — 011_transaction_due_date.sql
-- Adiciona vencimento (opcional) separado da data em transactions: "Data" é quando a
-- movimentação foi registrada/aconteceu; "Vencimento" é quando ela vence de fato, quando
-- diferente. É só informativo — não participa do trigger de saldo (que continua usando
-- só a coluna "date", como já corrigido em 009_manual_confirmation.sql).

alter table public.transactions add column if not exists due_date date;
