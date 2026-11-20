import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { queryKeys } from './keys'
import type { Loan, LoanPayment } from '../../types/database'

export function useLoans(includeArchived = false) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['loans', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      let query = supabase.from('loans').select('*').order('created_at', { ascending: false })
      if (!includeArchived) query = query.eq('archived', false)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as Loan[]
    },
  })
}

export function useLoanPayments(loanId: string | undefined) {
  return useQuery({
    queryKey: ['loan-payments', loanId],
    enabled: Boolean(loanId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_payments')
        .select('*')
        .eq('loan_id', loanId as string)
        .order('date', { ascending: false })
      if (error) throw new Error(error.message)
      return data as LoanPayment[]
    },
  })
}

/** Todos os pagamentos do usuário (RLS filtra) — usado para calcular o pendente por pessoa. */
export function useAllLoanPayments() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['loan-payments', 'all', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('loan_payments').select('*')
      if (error) throw new Error(error.message)
      return data as LoanPayment[]
    },
  })
}

export interface LoanInput {
  account_id: string
  counterparty: string
  direction: 'lent' | 'borrowed'
  principal_cents: number
  date: string
  due_date: string | null
  note: string | null
}

export function useLoanMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['loans', user?.id] })
    qc.invalidateQueries({ queryKey: ['loan-payments'] })
    qc.invalidateQueries({ queryKey: queryKeys.accounts(user?.id) })
    qc.invalidateQueries({ queryKey: queryKeys.dashboardSummary(user?.id) })
  }

  const create = useMutation({
    mutationFn: async (input: LoanInput) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('loans').insert({ ...input, user_id: user.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: LoanInput }) => {
      const { error } = await supabase.from('loans').update(input).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loans').update({ archived: true }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loans').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const registerPayment = useMutation({
    mutationFn: async ({ loanId, amountCents, date, accountId }: { loanId: string; amountCents: number; date: string; accountId?: string | null }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase
        .from('loan_payments')
        // account_id só vai quando o pagamento cai numa conta diferente da do empréstimo (sql/028)
        .insert({ loan_id: loanId, user_id: user.id, amount_cents: amountCents, date, ...(accountId ? { account_id: accountId } : {}) })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, vars) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['loan-payments', vars.loanId] })
    },
  })

  // Quita vários empréstimos de uma vez (um único insert = tudo ou nada).
  // O trigger apply_loan_payment_to_balance ajusta o saldo da conta escolhida no pagamento (sem conta,
  // a do empréstimo): lent → entra (+), borrowed → sai (-).
  const payOff = useMutation({
    mutationFn: async (items: { loanId: string; amountCents: number; accountId?: string | null }[]) => {
      if (!user) throw new Error('Não autenticado')
      const date = new Date()
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const rows = items
        .filter((i) => i.amountCents > 0)
        .map((i) => ({ loan_id: i.loanId, user_id: user.id, amount_cents: i.amountCents, date: iso, ...(i.accountId ? { account_id: i.accountId } : {}) }))
      if (rows.length === 0) return
      const { error } = await supabase.from('loan_payments').insert(rows)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  // Desfaz um pagamento específico (ex.: o último, pra "desfazer quitação" em Relatórios) — o trigger
  // reverte o saldo da conta automaticamente (mesmo mecanismo do INSERT, com o delta invertido).
  const removePayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from('loan_payments').delete().eq('id', paymentId)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { create, update, archive, remove, registerPayment, payOff, removePayment }
}
