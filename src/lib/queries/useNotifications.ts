import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'

export interface NotificationPrefs {
  enabled: boolean
  notify_due: boolean
  notify_receivable: boolean
  notify_cards: boolean
  notify_goals: boolean
  notify_summary: boolean
  days_before: number
  send_hour: number
}

// Sem linha no banco = tudo ativado (padrão para todo usuário, inclusive os novos).
export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  notify_due: true,
  notify_receivable: true,
  notify_cards: true,
  notify_goals: true,
  notify_summary: true,
  days_before: 1,
  send_hour: 9,
}

export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly'

export interface NotificationSchedule {
  id: string
  title: string
  message: string | null
  frequency: ScheduleFrequency
  start_date: string
  send_time: string
  active: boolean
  last_sent_on: string | null
}

export interface ScheduleInput {
  title: string
  message: string | null
  frequency: ScheduleFrequency
  start_date: string
  send_time: string
  active?: boolean
}

export function useNotificationPrefs() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notif-prefs', user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', user!.id).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? { ...DEFAULT_PREFS, ...data } : DEFAULT_PREFS
    },
  })
}

export function useSavePrefs() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<NotificationPrefs>) => {
      const current = qc.getQueryData<NotificationPrefs>(['notif-prefs', user?.id]) ?? DEFAULT_PREFS
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: user!.id, ...current, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
    },
    onMutate: async (patch) => {
      const key = ['notif-prefs', user?.id]
      const previous = qc.getQueryData<NotificationPrefs>(key)
      qc.setQueryData<NotificationPrefs>(key, { ...(previous ?? DEFAULT_PREFS), ...patch })
      return { previous }
    },
    onError: (_e, _p, ctx) => qc.setQueryData(['notif-prefs', user?.id], ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notif-prefs', user?.id] }),
  })
}

export function useSchedules() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notif-schedules', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_schedules')
        .select('*')
        .order('start_date', { ascending: true })
      if (error) throw new Error(error.message)
      return data as NotificationSchedule[]
    },
  })
}

export function useScheduleMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['notif-schedules', user?.id] })

  const create = useMutation({
    mutationFn: async (input: ScheduleInput) => {
      const { error } = await supabase.from('notification_schedules').insert({ ...input, user_id: user!.id })
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ScheduleInput> }) => {
      // mudou data/hora/frequência: libera para enviar de novo
      const resetSent = 'start_date' in input || 'send_time' in input || 'frequency' in input
      const { error } = await supabase
        .from('notification_schedules')
        .update({ ...input, ...(resetSent ? { last_sent_on: null } : {}) })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notification_schedules').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
  })
  return { create, update, remove }
}
