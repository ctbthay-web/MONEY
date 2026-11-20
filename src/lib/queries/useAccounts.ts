import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { queryKeys } from './keys'
import type { Account, AccountType } from '../../types/database'

export function useAccounts(includeArchived = false) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.accounts(user?.id),
    enabled: Boolean(user),
    queryFn: async () => {
      let query = supabase.from('accounts').select('*').order('created_at', { ascending: true })
      if (!includeArchived) query = query.eq('archived', false)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as Account[]
    },
  })
}

export interface AccountInput {
  name: string
  type: AccountType
  color: string
  icon: string
  credit_limit_cents?: number | null
  balance_cents?: number
  closing_day?: number | null
  due_day?: number | null
}

export function useAccountMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.accounts(user?.id) })

  const create = useMutation({
    mutationFn: async (input: AccountInput) => {
      if (!user) throw new Error('Não autenticado')
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...input, user_id: user.id })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<AccountInput> }) => {
      const { error } = await supabase.from('accounts').update(input).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').update({ archived: true }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: queryKeys.dashboardSummary(user?.id) })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: queryKeys.dashboardSummary(user?.id) })
      qc.invalidateQueries({ queryKey: queryKeys.transactions(user?.id) })
    },
  })

  return { create, update, archive, remove }
}
