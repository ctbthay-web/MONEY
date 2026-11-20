import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { useAuth } from '../../features/auth/AuthProvider'

export interface AiConversation {
  id: string
  title: string
  updated_at: string
}

export interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export function useConversations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ai-conversations', user?.id],
    enabled: Boolean(user),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id,title,updated_at')
        .order('updated_at', { ascending: false })
        .limit(30)
      if (error) throw new Error(error.message)
      return data as AiConversation[]
    },
  })
}

export async function fetchMessages(conversationId: string): Promise<AiMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id,role,content,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(error.message)
  return data as AiMessage[]
}

export function useAssistantHistoryMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['ai-conversations', user?.id] })

  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      if (!user) throw new Error('Não autenticado')
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user.id, title: title.slice(0, 80) || 'Nova conversa' })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return data.id as string
    },
    onSuccess: refresh,
  })

  /** Grava a pergunta e a resposta, na ordem, e marca a conversa como atualizada. */
  const addExchange = useMutation({
    mutationFn: async (input: { conversationId: string; question: string; answer: string }) => {
      if (!user) throw new Error('Não autenticado')
      const base = Date.now()
      const rows = [
        { conversation_id: input.conversationId, user_id: user.id, role: 'user', content: input.question.slice(0, 4000), created_at: new Date(base).toISOString() },
        { conversation_id: input.conversationId, user_id: user.id, role: 'assistant', content: input.answer.slice(0, 4000), created_at: new Date(base + 1).toISOString() },
      ]
      const { error } = await supabase.from('ai_messages').insert(rows)
      if (error) throw new Error(error.message)
      await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', input.conversationId)
    },
    onSuccess: refresh,
  })

  const removeConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_conversations').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: refresh,
  })

  return { createConversation, addExchange, removeConversation }
}
