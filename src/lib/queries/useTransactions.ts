import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addWeeks, addMonths, addYears, format, parseISO } from 'date-fns'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { queryKeys } from './keys'
import type { RecurrenceFrequency, TransactionWithRelations, TxType } from '../../types/database'

export interface TransactionFilters {
  type?: TxType | 'all'
  search?: string
  categoryId?: string | 'all'
  accountId?: string | 'all'
  startDate?: string
  endDate?: string
}

export function useTransactions(filters: TransactionFilters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.transactions(user?.id, filters),
    enabled: Boolean(user),
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(
          '*, category:categories(id, name, color, icon, type), account:accounts(id, name, color, icon, type, closing_day, due_day)'
        )
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
      if (filters.categoryId && filters.categoryId !== 'all') query = query.eq('category_id', filters.categoryId)
      if (filters.accountId && filters.accountId !== 'all') query = query.eq('account_id', filters.accountId)
      if (filters.startDate) query = query.gte('date', filters.startDate)
      if (filters.endDate) query = query.lte('date', filters.endDate)
      if (filters.search) query = query.ilike('description', `%${filters.search}%`)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as unknown as TransactionWithRelations[]
    },
  })
}

export interface TransactionInput {
  account_id: string
  category_id: string | null
  type: TxType
  amount_cents: number
  description: string
  note: string | null
  date: string
  due_date: string | null
}

export type RepeatMode = 'none' | 'recurring' | 'installment'

export interface RepeatConfig {
  mode: RepeatMode
  frequency?: RecurrenceFrequency
  occurrences?: number
}

function addByFrequency(date: Date, frequency: RecurrenceFrequency, amount: number) {
  if (frequency === 'weekly') return addWeeks(date, amount)
  if (frequency === 'yearly') return addYears(date, amount)
  return addMonths(date, amount)
}

export function buildSeriesRows(input: TransactionInput, repeat: RepeatConfig, userId: string) {
  const occurrences = repeat.occurrences ?? 1
  if (repeat.mode === 'none' || occurrences <= 1) {
    return [{ ...input, user_id: userId }]
  }

  const seriesId = crypto.randomUUID()
  const baseDate = parseISO(input.date)
  // O vencimento acompanha cada parcela/recorrência (mesmo deslocamento da data), senão todas
  // ficariam vencendo no mesmo dia.
  const baseDue = input.due_date ? parseISO(input.due_date) : null

  if (repeat.mode === 'installment') {
    const perInstallment = Math.floor(input.amount_cents / occurrences)
    const remainder = input.amount_cents - perInstallment * occurrences
    return Array.from({ length: occurrences }, (_, i) => ({
      ...input,
      user_id: userId,
      amount_cents: perInstallment + (i === occurrences - 1 ? remainder : 0),
      date: format(addMonths(baseDate, i), 'yyyy-MM-dd'),
      due_date: baseDue ? format(addMonths(baseDue, i), 'yyyy-MM-dd') : null,
      description: `${input.description} (${i + 1}/${occurrences})`,
      series_id: seriesId,
      installment_number: i + 1,
      installment_total: occurrences,
    }))
  }

  const frequency = repeat.frequency ?? 'monthly'
  return Array.from({ length: occurrences }, (_, i) => ({
    ...input,
    user_id: userId,
    date: format(addByFrequency(baseDate, frequency, i), 'yyyy-MM-dd'),
    due_date: baseDue ? format(addByFrequency(baseDue, frequency, i), 'yyyy-MM-dd') : null,
    series_id: seriesId,
    recurrence_frequency: frequency,
    installment_number: i + 1,
    installment_total: occurrences,
  }))
}

export function useTransactionMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['transactions', user?.id] })
    qc.invalidateQueries({ queryKey: queryKeys.accounts(user?.id) })
    qc.invalidateQueries({ queryKey: queryKeys.dashboardSummary(user?.id) })
    qc.invalidateQueries({ queryKey: ['reports-summary', user?.id] })
  }

  const create = useMutation({
    mutationFn: async ({ input, repeat }: { input: TransactionInput; repeat?: RepeatConfig }) => {
      if (!user) throw new Error('Não autenticado')
      const rows = buildSeriesRows(input, repeat ?? { mode: 'none' }, user.id)
      const { error } = await supabase.from('transactions').insert(rows)
      if (error) throw new Error(error.message)
      return rows.length
    },
    onSuccess: invalidateAll,
  })

  // Importação de fatura: vários lançamentos de uma vez (tudo ou nada).
  const createMany = useMutation({
    mutationFn: async (inputs: TransactionInput[]) => {
      if (!user) throw new Error('Não autenticado')
      if (inputs.length === 0) return 0
      const rows = inputs.map((i) => ({ ...i, user_id: user.id }))
      const { error } = await supabase.from('transactions').insert(rows)
      if (error) throw new Error(error.message)
      return rows.length
    },
    onSuccess: invalidateAll,
  })

  const update = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<TransactionInput> & { applied_to_balance?: boolean }
    }) => {
      const { error } = await supabase.from('transactions').update(input).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidateAll,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidateAll,
  })

  // Confirmação manual: só aqui `applied_to_balance` passa a true — nunca sozinho por data.
  const confirm = useMutation({
    mutationFn: async ({ id, date }: { id: string; date?: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({ applied_to_balance: true, ...(date ? { date } : {}) })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidateAll,
  })

  // Desfaz uma confirmação feita por engano: volta applied_to_balance para false
  // (o trigger reverte o efeito no saldo automaticamente).
  const unconfirm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').update({ applied_to_balance: false }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidateAll,
  })

  return { create, createMany, update, remove, confirm, unconfirm }
}
