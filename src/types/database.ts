export type Role = 'user' | 'admin'
export type TxType = 'income' | 'expense'
export type AccountType = 'checking' | 'savings' | 'credit_card' | 'wallet' | 'investment'
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: Role
  plan_id: string
  trial_ends_at: string | null
  is_active: boolean
  is_lifetime: boolean
  paid_until: string | null
  billing_status: string | null
  billing_provider: string | null
  /** nome que o usuário deu à própria assistente (plano Premium); null = ainda não escolheu */
  agent_name: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string | null
  name: string
  type: TxType
  color: string
  icon: string
  created_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  color: string
  icon: string
  credit_limit_cents: number | null
  balance_cents: number
  archived: boolean
  closing_day: number | null
  due_day: number | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TxType
  amount_cents: number
  description: string
  note: string | null
  date: string
  due_date: string | null
  applied_to_balance: boolean
  series_id: string | null
  installment_number: number | null
  installment_total: number | null
  recurrence_frequency: RecurrenceFrequency | null
  /** recorrência (valor variável / por ocorrência) à qual esta movimentação pertence — sql/029 */
  recurrence_id?: string | null
  /** data da ocorrência esperada que esta movimentação cumpre (única por recorrência) */
  recurrence_date?: string | null
  created_at: string
  updated_at: string
}

export type RecurrenceMode = 'fixed' | 'variable' | 'per_occurrence'
export type RecurrenceStatus = 'active' | 'paused' | 'ended' | 'dismissed'

/** Cadastro de uma recorrência (sql/029). Previsões NÃO são linhas de transactions. */
export interface Recurrence {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TxType
  description: string
  mode: RecurrenceMode
  frequency: RecurrenceFrequency
  amount_cents: number | null
  anchor_date: string
  active_from: string
  status: RecurrenceStatus
  ended_at: string | null
  source: 'manual' | 'legacy' | 'detected'
  series_id: string | null
  skipped_dates: string[]
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  user_id: string
  name: string
  target_cents: number
  accumulated_cents: number
  deadline: string | null
  color: string
  icon: string
  archived: boolean
  created_at: string
  updated_at: string
}

export interface GoalContribution {
  id: string
  goal_id: string
  user_id: string
  amount_cents: number
  note: string | null
  date: string
  created_at: string
}

export interface Plan {
  id: string
  name: string
  price_cents: number
  limits: Record<string, unknown>
  created_at: string
}

export interface TransactionWithRelations extends Transaction {
  category: Pick<Category, 'id' | 'name' | 'color' | 'icon' | 'type'> | null
  account: Pick<Account, 'id' | 'name' | 'color' | 'icon' | 'type' | 'closing_day' | 'due_day'> | null
}

export interface Transfer {
  id: string
  user_id: string
  from_account_id: string
  to_account_id: string
  amount_cents: number
  description: string | null
  date: string
  applied_to_balance: boolean
  invoice_period: string | null
  created_at: string
}

export interface TransferWithRelations extends Transfer {
  from_account: Pick<Account, 'id' | 'name' | 'color' | 'icon'> | null
  to_account: Pick<Account, 'id' | 'name' | 'color' | 'icon'> | null
}

export type LoanDirection = 'lent' | 'borrowed'

export interface Loan {
  id: string
  user_id: string
  account_id: string
  counterparty: string
  direction: LoanDirection
  principal_cents: number
  date: string
  due_date: string | null
  note: string | null
  archived: boolean
  created_at: string
}

export interface LoanPayment {
  id: string
  loan_id: string
  user_id: string
  /** conta em que o pagamento caiu; null = a conta do empréstimo (pagamentos antigos) */
  account_id: string | null
  amount_cents: number
  date: string
  created_at: string
}
