import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { buildSeriesRows, type TransactionInput } from './useTransactions'
import { legacySeries, recurrenceFromLegacy } from '../recurrence'
import type { RecurrenceSuggestion } from '../recurrenceDetect'
import type { Recurrence, RecurrenceFrequency, RecurrenceMode, RecurrenceStatus, TransactionWithRelations } from '../../types/database'

/** Cadastro das recorrências. Se a tabela ainda não existe (sql/029 não rodou), a consulta falha e a tela avisa. */
export function useRecurrences() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['recurrences', user?.id],
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from('recurrences').select('*').order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data as Recurrence[]
    },
  })
}

/** Mensagem amigável quando a migração sql/029 ainda não foi aplicada no banco. */
function friendly(message: string): string {
  return /recurrences|recurrence_id|recurrence_date/.test(message) && /schema cache|does not exist|column|relation/i.test(message)
    ? 'As recorrências ainda estão sendo configuradas. Tente novamente em instantes.'
    : message
}

export interface RecurringCreateInput {
  input: TransactionInput
  mode: RecurrenceMode
  frequency: RecurrenceFrequency
  /** só para valor fixo: quantas ocorrências criar agora */
  occurrences: number
}

export interface FulfillInput {
  recurrence: Recurrence
  /** data esperada da ocorrência (chave única) */
  expectedDate: string
  amountCents: number
  /** data da movimentação (padrão: a data esperada) */
  date?: string
  note?: string | null
  /** já foi paga/recebida? (o banco confirma sozinho lançamentos com data de hoje ou passada; false desfaz) */
  paid: boolean
}

export function useRecurrenceMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['recurrences', user?.id] })
    qc.invalidateQueries({ queryKey: ['transactions', user?.id] })
    qc.invalidateQueries({ queryKey: ['accounts', user?.id] })
    qc.invalidateQueries({ queryKey: ['dashboard-summary', user?.id] })
    qc.invalidateQueries({ queryKey: ['reports-summary', user?.id] })
  }
  const need = () => {
    if (!user) throw new Error('Não autenticado')
    return user.id
  }

  /** Nova movimentação recorrente: fixa (cria as ocorrências, como sempre) ou variável/por ocorrência (só a primeira). */
  const createRecurring = useMutation({
    mutationFn: async ({ input, mode, frequency, occurrences }: RecurringCreateInput) => {
      const userId = need()
      if (mode === 'fixed') {
        const rows = buildSeriesRows(input, { mode: 'recurring', frequency, occurrences }, userId)
        const { error } = await supabase.from('transactions').insert(rows)
        if (error) throw new Error(error.message)
        // cadastro da recorrência (melhor esforço: se a tabela ainda não existe, as movimentações já foram criadas)
        const seriesId = (rows[0] as { series_id?: string }).series_id
        if (seriesId) {
          await supabase.from('recurrences').insert({
            user_id: userId,
            account_id: input.account_id,
            category_id: input.category_id,
            type: input.type,
            description: input.description,
            mode: 'fixed',
            frequency,
            amount_cents: input.amount_cents,
            anchor_date: input.date,
            active_from: input.date,
            source: 'manual',
            series_id: seriesId,
          })
        }
        return rows.length
      }

      const { data: rec, error: recError } = await supabase
        .from('recurrences')
        .insert({
          user_id: userId,
          account_id: input.account_id,
          category_id: input.category_id,
          type: input.type,
          description: input.description,
          mode,
          frequency,
          amount_cents: mode === 'variable' ? input.amount_cents : null,
          anchor_date: input.date,
          active_from: input.date,
          source: 'manual',
        })
        .select('id')
        .single()
      if (recError) throw new Error(friendly(recError.message))
      const { error: txError } = await supabase
        .from('transactions')
        .insert({ ...input, user_id: userId, recurrence_id: rec.id, recurrence_date: input.date })
      if (txError) {
        await supabase.from('recurrences').delete().eq('id', rec.id) // não deixa cadastro órfão
        throw new Error(friendly(txError.message))
      }
      return 1
    },
    onSuccess: invalidate,
  })

  /** Passa a gerenciar UMA série antiga como "valor fixo". Não altera, apaga nem duplica nenhuma movimentação. */
  const adoptOne = useMutation({
    mutationFn: async ({ seriesId, transactions }: { seriesId: string; transactions: TransactionWithRelations[] }) => {
      const userId = need()
      const { data: existing, error: e0 } = await supabase.from('recurrences').select('*')
      if (e0) throw new Error(e0.message)
      const series = legacySeries(transactions, (existing ?? []) as Recurrence[]).find((s) => s.seriesId === seriesId)
      if (!series) throw new Error('Série não encontrada ou já cadastrada.')
      const { data, error } = await supabase.from('recurrences').insert(recurrenceFromLegacy(series, userId)).select('*').single()
      if (error) throw new Error(error.message)
      return data as Recurrence
    },
    onSuccess: invalidate,
  })

  /** Edita o cadastro (vale para as PRÓXIMAS ocorrências/previsões; movimentações já lançadas não mudam). */
  const updateRecurrence = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Pick<Recurrence, 'description' | 'category_id' | 'account_id' | 'amount_cents' | 'mode' | 'frequency'>>
    }) => {
      const { error } = await supabase.from('recurrences').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  /** Pausar, encerrar ou reativar. Reativar só prevê a partir de hoje (não gera atrasos de quando estava parada). */
  const setStatus = useMutation({
    mutationFn: async ({ id, status, today }: { id: string; status: RecurrenceStatus; today: string }) => {
      const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
      if (status === 'ended') patch.ended_at = today
      if (status === 'active') {
        patch.ended_at = null
        patch.active_from = today
      }
      const { error } = await supabase.from('recurrences').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const skipOccurrence = useMutation({
    mutationFn: async ({ recurrence, date }: { recurrence: Recurrence; date: string }) => {
      const next = Array.from(new Set([...(recurrence.skipped_dates ?? []), date]))
      const { error } = await supabase.from('recurrences').update({ skipped_dates: next, updated_at: new Date().toISOString() }).eq('id', recurrence.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  /** Informa o valor real de uma ocorrência prevista: cria a movimentação ligada à recorrência (nunca duplica). */
  const fulfill = useMutation({
    mutationFn: async ({ recurrence, expectedDate, amountCents, date, note, paid }: FulfillInput) => {
      const userId = need()
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          account_id: recurrence.account_id,
          category_id: recurrence.category_id,
          type: recurrence.type,
          amount_cents: amountCents,
          description: recurrence.description,
          note: note ?? null,
          date: date ?? expectedDate,
          due_date: null,
          recurrence_id: recurrence.id,
          recurrence_date: expectedDate,
        })
        .select('id, applied_to_balance')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('Essa ocorrência já foi lançada.')
        throw new Error(error.message)
      }
      // o banco confirma sozinho o que tem data de hoje/passada; se ainda não foi pago, desfaz (o saldo reverte pelo trigger)
      if (!paid && data.applied_to_balance) {
        const { error: e2 } = await supabase.from('transactions').update({ applied_to_balance: false }).eq('id', data.id)
        if (e2) throw new Error(e2.message)
      }
    },
    onSuccess: invalidate,
  })

  /** Remove só as ocorrências FUTURAS e NÃO confirmadas de uma série de valor fixo (ação explícita do usuário). */
  const removeFutureOpen = useMutation({
    mutationFn: async ({ seriesId, fromDate }: { seriesId: string; fromDate: string }) => {
      const { error, count } = await supabase
        .from('transactions')
        .delete({ count: 'exact' })
        .eq('series_id', seriesId)
        .eq('applied_to_balance', false)
        .gt('date', fromDate)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    onSuccess: invalidate,
  })

  /** "Esta e as próximas": aplica valor/descrição/categoria/conta às próximas ocorrências NÃO confirmadas da série. */
  const updateSeriesFrom = useMutation({
    mutationFn: async ({
      seriesId,
      fromDate,
      patch,
    }: {
      seriesId: string
      fromDate: string
      patch: { amount_cents?: number; description?: string; category_id?: string | null; account_id?: string; note?: string | null }
    }) => {
      const { error, count } = await supabase
        .from('transactions')
        .update(patch, { count: 'exact' })
        .eq('series_id', seriesId)
        .eq('applied_to_balance', false)
        .gt('date', fromDate)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    onSuccess: invalidate,
  })

  /** O usuário aceitou a sugestão: só cria o CADASTRO (nenhuma movimentação é criada nem alterada). */
  const acceptSuggestion = useMutation({
    mutationFn: async ({ suggestion, mode }: { suggestion: RecurrenceSuggestion; mode: RecurrenceMode }) => {
      const userId = need()
      const { error } = await supabase.from('recurrences').insert({
        user_id: userId,
        account_id: suggestion.accountId,
        category_id: suggestion.categoryId,
        type: suggestion.type,
        description: suggestion.description,
        mode,
        frequency: suggestion.frequency,
        amount_cents: mode === 'fixed' ? suggestion.lastAmountCents : mode === 'variable' ? suggestion.averageCents : null,
        anchor_date: suggestion.lastDate,
        // previsões só a partir da próxima data: o que já aconteceu não vira "atrasado"
        active_from: suggestion.nextDate,
        source: 'detected',
      })
      if (error) throw new Error(friendly(error.message))
    },
    onSuccess: invalidate,
  })

  /** "Não": guarda a recusa (status dispensada) para o app não sugerir a mesma de novo. */
  const dismissSuggestion = useMutation({
    mutationFn: async (suggestion: RecurrenceSuggestion) => {
      const userId = need()
      const { error } = await supabase.from('recurrences').insert({
        user_id: userId,
        account_id: suggestion.accountId,
        category_id: suggestion.categoryId,
        type: suggestion.type,
        description: suggestion.description,
        mode: 'per_occurrence',
        frequency: suggestion.frequency,
        amount_cents: null,
        anchor_date: suggestion.lastDate,
        active_from: suggestion.nextDate,
        status: 'dismissed',
        source: 'detected',
      })
      if (error) throw new Error(friendly(error.message))
    },
    onSuccess: invalidate,
  })

  return {
    acceptSuggestion,
    dismissSuggestion,
    createRecurring,
    adoptOne,
    updateRecurrence,
    setStatus,
    skipOccurrence,
    fulfill,
    removeFutureOpen,
    updateSeriesFrom,
  }
}
