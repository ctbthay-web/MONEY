-- Money — 010_loan_due_date.sql
-- Adiciona data de vencimento (opcional) aos empréstimos: quando emprestei ou peguei
-- emprestado, dá pra registrar até quando espero a devolução / preciso devolver.

alter table public.loans add column if not exists due_date date;
