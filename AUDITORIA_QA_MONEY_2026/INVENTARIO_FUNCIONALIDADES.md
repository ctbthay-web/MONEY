# Inventário de funcionalidades (fonte: CLAUDE.md, código e SQL)
| Módulo | Funcionalidades | Regras principais | Situação |
|---|---|---|---|
| Autenticação | Cadastro, login, esqueci/redefinir senha, sessão (Supabase), ProtectedRoute, AccessGate | Sem trial (024); bloqueio de tela sem acesso; lockout só no cliente | Implementado |
| Dashboard | Saldo total (exclui cartão de crédito), resumo do mês, gráficos, contas a vencer | Saldo = soma de contas líquidas (`totalLiquidBalanceCents`) | Implementado |
| Movimentações | Receita/despesa, recorrente, parcelado (série), editar/excluir, confirmar baixa | `applied_to_balance` via trigger; futuro só aplica após vencimento; valor em centavos | Implementado |
| Contas / transferências | CRUD, arquivar, transferir | Transferência ≠ receita/despesa; trigger `apply_transfer_to_balance` | Implementado |
| Cartões / faturas | Fechamento/vencimento, faturas por período, pagar fatura, importar fatura (Plus+) | Pagamento de fatura = transfer com `invoice_period`; não é 2ª despesa | Implementado |
| Contas a pagar/receber | Lista por vencimento, pagar antecipado | Pago antes continua listado; sem 2ª despesa | Implementado (dentro de Movimentações) |
| Empréstimos (Plus+) | Criar, parcelas, quitar tudo | Entra/sai do saldo sem ser receita (triggers de loan) | Implementado |
| Metas / Reservas | Metas, aportes, marcos 25/50/80/100% | — | Implementado |
| Planejamento (Pro+) | Orçamento por categoria, previsão até fim do mês | Alertas de orçamento | Implementado |
| Relatórios | Gráficos, análise, CSV/PDF (Pro+) | Histórico: 6m Start, 24m Pro, ilimitado Premium | Implementado |
| Notificações | Push (cron 09:00 BRT), contas, recebimentos, cartão, metas, resumo, lembretes | Dedupe em `notification_log`; horário removido nesta sessão | Implementado |
| Assistente | Chat por regras (nlu/engine/advisor), nome personalizável (Premium) | Não inventa dado: responde de dados do usuário | Implementado (sem IA generativa) |
| Planos / assinatura | Start 25 / Plus 50 / Pro 70 / Premium ilimitado; R$19,90/29,90/39,90/59,90 (1ª cobrança 9,90/19,90/29,90/39,90) | Cota no banco (`z_tx_quota`); recursos só na UI | Implementado |
| Billing | Webhook Kiwify; Asaas legado ainda ativo | Idempotência `billing_events` | Implementado (risco) |
| Admin | Painel administrativo | Restrito por perfil | Implementado |
| Patrimônio (ativos − passivos) | — | Brief pede cálculo dedicado | **Não implementado** (existem reservas/metas, não um módulo de patrimônio) |
