import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { queryKeys } from './keys'
import type { TransferWithRelations } from '../../types/database'

export function useTransfers() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transfers', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transfers')
        .select('*, from_account:accounts!transfers_from_account_id_fkey(id,name,color,icon), to_account:accounts!transfers_to_account_id_fkey(id,name,color,icon)')
        .order('date', { ascending: false })
      if (error) throw new Error(error.message)
      return data as unknown as TransferWithRelations[]
    },
  })
}

export interface TransferInput {
  from_account_id: string
  to_account_id: string
  amount_cents: number
  description: string | null
  date: string
  invoice_period?: string | null
}

export function useTransferMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['transfers', user?.id] })
    qc.invalidateQueries({ queryKey: queryKeys.accounts(user?.id) })
    qc.invalidateQueries({ queryKey: queryKeys.dashboardSummary(user?.id) })
  }

  const create = useMutation({
    mutationFn: async (input: TransferInput) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('transfers').insert({ ...input, user_id: user.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidateAll,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transfers').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidateAll,
  })

  return { create, remove }
}
