import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount_cents: number
}

const key = (userId?: string) => ['budgets', userId] as const

export function useBudgets() {
  const { user } = useAuth()
  return useQuery({
    queryKey: key(user?.id),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('budgets').select('id,user_id,category_id,amount_cents')
      if (error) throw new Error(error.message)
      return data as Budget[]
    },
  })
}

export function useBudgetMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: key(user?.id) })

  const save = useMutation({
    mutationFn: async (input: { category_id: string; amount_cents: number }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase
        .from('budgets')
        .upsert(
          { user_id: user.id, category_id: input.category_id, amount_cents: input.amount_cents, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,category_id' }
        )
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { save, remove }
}
