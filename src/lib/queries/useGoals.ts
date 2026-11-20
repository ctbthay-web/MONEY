import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'
import { queryKeys } from './keys'
import type { Goal, GoalContribution } from '../../types/database'

export function useGoals(includeArchived = false) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.goals(user?.id),
    enabled: Boolean(user),
    queryFn: async () => {
      let query = supabase.from('goals').select('*').order('created_at', { ascending: true })
      if (!includeArchived) query = query.eq('archived', false)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as Goal[]
    },
  })
}

export function useGoalContributions(goalId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.goalContributions(goalId),
    enabled: Boolean(goalId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('*')
        .eq('goal_id', goalId as string)
        .order('date', { ascending: false })
      if (error) throw new Error(error.message)
      return data as GoalContribution[]
    },
  })
}

export interface GoalInput {
  name: string
  target_cents: number
  deadline: string | null
  color: string
  icon: string
}

export function useGoalMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.goals(user?.id) })
    qc.invalidateQueries({ queryKey: queryKeys.dashboardSummary(user?.id) })
  }

  const create = useMutation({
    mutationFn: async (input: GoalInput) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase.from('goals').insert({ ...input, user_id: user.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<GoalInput> }) => {
      const { error } = await supabase.from('goals').update(input).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').update({ archived: true }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })

  const contribute = useMutation({
    mutationFn: async ({ goalId, amountCents, note }: { goalId: string; amountCents: number; note?: string }) => {
      if (!user) throw new Error('Não autenticado')
      const { error } = await supabase
        .from('goal_contributions')
        .insert({ goal_id: goalId, user_id: user.id, amount_cents: amountCents, note: note || null })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, variables) => {
      invalidate()
      qc.invalidateQueries({ queryKey: queryKeys.goalContributions(variables.goalId) })
    },
  })

  return { create, update, archive, remove, contribute }
}
