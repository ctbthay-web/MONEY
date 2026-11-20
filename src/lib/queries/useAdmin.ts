import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from './keys'
import type { Profile, Role } from '../../types/database'

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.adminUsers(),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as Profile[]
    },
  })
}

export function useAdminStats() {
  return useQuery({
    queryKey: queryKeys.adminStats(),
    queryFn: async () => {
      const [{ count: userCount }, { count: accountCount }, { count: txCount }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('accounts').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
      ])
      return {
        userCount: userCount ?? 0,
        accountCount: accountCount ?? 0,
        transactionCount: txCount ?? 0,
      }
    },
  })
}

export function useAdminMutations() {
  const qc = useQueryClient()

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error } = await supabase.rpc('admin_set_user_role', { target_user_id: userId, new_role: role })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminUsers() }),
  })

  const runCleanup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_run_transaction_cleanup')
      if (error) throw new Error(error.message)
      return data as number
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminStats() }),
  })

  return { setRole, runCleanup }
}
