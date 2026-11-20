# Testes financeiros — regras de negócio
Status: **verificadas por leitura de código/SQL; NÃO executadas dinamicamente.**
| Regra | Evidência estática | Dinâmico |
|---|---|---|
| Transferência não é receita/despesa | Tabela `transfers` separada; trigger `apply_transfer_to_balance` | Pendente |
| Conta paga antecipada: continua listada, sem 2ª despesa | `applied_to_balance` manual/por vencimento | Pendente |
| Pagamento de fatura não é 2ª despesa | Pagamento = `transfers` com `invoice_period`; compras do cartão já são despesa | Pendente |
| Empréstimo entra/sai do saldo sem ser receita | Triggers `apply_loan_to_balance`, `apply_loan_payment_to_balance` | Pendente |
| Saldo total exclui cartão de crédito | `totalLiquidBalanceCents` | Pendente |
| Valores em centavos (sem float) | `amount_cents` / `balance_cents` | Pendente |
| Patrimônio = ativos − passivos | **Não implementado** como módulo | N/A |
| Assistente não inventa dados | Motor por regras sobre dados do usuário | Pendente |
| Limites de plano | Cota no banco (INSERT) — burlável, ver ALTA-01 | Pendente |
Cenários para executar (valores): conta R$1.000 → despesa R$100 (saldo 900) → transferência R$200 (saldo origem 700, destino +200, relatório de despesas inalterado) → parcelar R$300 em 3x (3 lançamentos de R$100) → pagar fatura (saldo −fatura, despesas inalteradas) → empréstimo R$1.000 (saldo +1000, receitas inalteradas).
