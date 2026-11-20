import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { queryKeys } from './keys'
import type { Category, TxType } from '../../types/database'

export function useCategories(type?: TxType) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.categories(user?.id),
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as Category[]
    },
    select: (data) => (type ? data.filter((c) => c.type === type) : data),
  })
}

export interface CategoryInput {
  name: string
  type: TxType
  color: string
  icon: string
}

export function useCategoryMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.categories(user?.id) })

  const create = useMutation({
    mutationFn: async (input: CategoryInput) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('categories').insert({ ...input, user_id: user.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CategoryInput> }) => {
      const { error } = await supabase.from('categories').update(input).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
