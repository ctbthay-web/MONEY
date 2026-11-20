import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { History, Lock, Plus, Send, Settings2, Sparkles, Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { canUseFeature, featureMinPlan } from '../lib/plans'
import { AGENT_NAME_MAX, agentIntro, normalizeAgentName, validateAgentName } from '../lib/agent'
import { answerQuestion, type Memory } from '../lib/assistant/engine'
import { todayISO } from '../lib/format'
import { useAccounts } from '../lib/queries/useAccounts'
import { useTransactions } from '../lib/queries/useTransactions'
import { useTransfers } from '../lib/queries/useTransfers'
import { useGoals } from '../lib/queries/useGoals'
import { useLoans, useAllLoanPayments } from '../lib/queries/useLoans'
import { useBudgets } from '../lib/queries/useBudgets'
import { useCategories } from '../lib/queries/useCategories'
import {
  fetchMessages,
  useAssistantHistoryMutations,
  useConversations,
  type AiConversation,
} from '../lib/queries/useAssistantHistory'

const MENU_SUGGESTIONS = ['Como está meu mês?', 'Qual meu saldo?', 'O que vence essa semana?', 'Vou ficar no vermelho?']

function AgentAvatar({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 rounded-[1.75rem]' : 'h-11 w-11 rounded-2xl'
  const icon = size === 'lg' ? 'h-9 w-9' : 'h-5 w-5'
  return (
    <div className={`flex shrink-0 items-center justify-center bg-brand-gradient text-[#04241C] shadow-glow ${box}`}>
      <Sparkles className={icon} strokeWidth={2.2} />
    </div>
  )
}

/** Grava o nome no perfil do próprio usuário. O banco confere formato e se o plano permite (sql/025). */
function useSaveAgentName() {
  const { user, refreshProfile } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  async function save(raw: string): Promise<boolean> {
    const error = validateAgentName(raw)
    if (error) {
      toast.error(error)
      return false
    }
    if (!user) return false
    setSaving(true)
    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ agent_name: normalizeAgentName(raw) })
        .eq('id', user.id)
      if (dbError) throw new Error(dbError.message)
      await refreshProfile()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o nome.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return { save, saving }
}

function NameSetup() {
  const [value, setValue] = useState('')
  const { save, saving } = useSaveAgentName()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await save(value)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-6 text-center sm:py-12">
      <AgentAvatar size="lg" />
      <h1 className="font-display mt-6 text-2xl font-bold text-ink-primary sm:text-3xl">Olá! Que bom ter você aqui!</h1>
      <p className="mt-3 text-ink-secondary">
        Antes de começarmos, quero saber uma coisa: como você gostaria de me chamar?
      </p>

      <form onSubmit={onSubmit} className="glass mt-8 flex w-full flex-col gap-4 rounded-3xl p-5 text-left sm:p-6">
        <Input
          label="Nome da sua assistente"
          placeholder="Ex.: Luna, Mia, Aurora…"
          value={value}
          maxLength={AGENT_NAME_MAX}
          autoFocus
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" loading={saving} disabled={normalizeAgentName(value).length < 2}>
          Esse será meu nome!
        </Button>
        <p className="text-center text-xs text-ink-muted">
          Você pode escolher outro nome quando quiser, nas configurações da sua assistente.
        </p>
      </form>
    </div>
  )
}

function RenameModal({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const [value, setValue] = useState(current)
  const { save, saving } = useSaveAgentName()
  const toast = useToast()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (normalizeAgentName(value) === current) {
      onClose()
      return
    }
    if (await save(value)) {
      toast.success('Nome atualizado. Suas conversas continuam aqui.')
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Configurações da assistente">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome da minha assistente"
          value={value}
          maxLength={AGENT_NAME_MAX}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-xs text-ink-muted">
          Ao trocar o nome, a identidade muda na hora e nenhuma conversa é apagada.
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" loading={saving} disabled={normalizeAgentName(value).length < 2}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface ChatMessage {
  key: string
  role: 'user' | 'assistant'
  content: string
}

function Conversation({ name }: { name: string }) {
  const toast = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleting, setDeleting] = useState<AiConversation | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [suggestions, setSuggestions] = useState<string[]>(MENU_SUGGESTIONS)
  const [input, setInput] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const memory = useRef<Memory | null>(null)

  // dados do próprio usuário (a assistente só enxerga o que o app já mostra para ele)
  const { data: accounts, isLoading: l1 } = useAccounts()
  const { data: transactions, isLoading: l2 } = useTransactions()
  const { data: transfers } = useTransfers()
  const { data: goals } = useGoals()
  const { data: loans } = useLoans()
  const { data: loanPayments } = useAllLoanPayments()
  const { data: budgets } = useBudgets()
  const { data: categories } = useCategories()
  const loadingData = l1 || l2

  const { data: conversations = [], isError: historyError } = useConversations()
  const { createConversation, addExchange, removeConversation } = useAssistantHistoryMutations()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  async function send(raw: string) {
    const question = raw.trim().slice(0, 300)
    if (!question || loadingData) return
    const reply = answerQuestion(question, {
      name,
      today: todayISO(),
      accounts: accounts ?? [],
      transactions: transactions ?? [],
      transfers: transfers ?? [],
      goals: goals ?? [],
      loans: loans ?? [],
      loanPayments: loanPayments ?? [],
      budgets: budgets ?? [],
      categories: categories ?? [],
    }, memory.current)
    memory.current = { question: reply.asked ?? question, intent: reply.intent }
    const stamp = Date.now()
    setMessages((m) => [
      ...m,
      { key: `u${stamp}`, role: 'user', content: question },
      { key: `a${stamp}`, role: 'assistant', content: reply.text },
    ])
    setSuggestions(reply.suggestions)
    setInput('')

    // histórico: se não conseguir gravar (ex.: banco ainda sem a migração), a conversa continua funcionando
    try {
      let id = activeId
      if (!id) {
        id = await createConversation.mutateAsync(question)
        setActiveId(id)
      }
      await addExchange.mutateAsync({ conversationId: id, question, answer: reply.text })
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  function newConversation() {
    setActiveId(null)
    memory.current = null
    setMessages([])
    setSuggestions(MENU_SUGGESTIONS)
    setSaveFailed(false)
  }

  async function openConversation(c: AiConversation) {
    try {
      const rows = await fetchMessages(c.id)
      setMessages(rows.map((r) => ({ key: r.id, role: r.role, content: r.content })))
      setActiveId(c.id)
      memory.current = null
      setSuggestions(MENU_SUGGESTIONS)
      setSaveFailed(false)
      setHistoryOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir a conversa.')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await removeConversation.mutateAsync(deleting.id)
      if (deleting.id === activeId) newConversation()
      setDeleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível apagar.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <AgentAvatar />
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-bold text-ink-primary">{name}</h1>
          <p className="text-sm text-ink-secondary">Sua assistente financeira</p>
        </div>
        <button
          onClick={newConversation}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-primary"
          aria-label="Nova conversa"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          onClick={() => setHistoryOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-primary"
          aria-label="Histórico de conversas"
        >
          <History className="h-5 w-5" />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-primary"
          aria-label="Configurações da assistente"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </div>

      <Card glow className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex max-h-[55svh] min-h-[280px] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex items-start gap-3">
            <AgentAvatar />
            <div className="max-w-[88%] whitespace-pre-line rounded-3xl rounded-tl-lg bg-white/5 px-4 py-3 text-sm text-ink-primary">
              {agentIntro(name)}
            </div>
          </div>

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.key} className="flex justify-end">
                <div className="max-w-[88%] whitespace-pre-line rounded-3xl rounded-tr-lg bg-brand-500/20 px-4 py-3 text-sm text-ink-primary">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.key} className="flex items-start gap-3">
                <AgentAvatar />
                <div className="max-w-[88%] whitespace-pre-line rounded-3xl rounded-tl-lg bg-white/5 px-4 py-3 text-sm text-ink-primary">
                  {m.content}
                </div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              disabled={loadingData}
              onClick={() => void send(s)}
              className="rounded-full border border-border px-3.5 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-brand-400/50 hover:text-brand-300 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            value={input}
            maxLength={300}
            disabled={loadingData}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loadingData ? 'Carregando seus dados…' : `Pergunte algo para ${name}…`}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
          />
          <button
            type="submit"
            disabled={loadingData || input.trim().length === 0}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] transition disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>

        <p className="text-center text-[11px] text-ink-muted">
          {name} responde com os números reais das suas finanças.
          {(saveFailed || historyError) && ' O histórico não está sendo salvo no momento.'}
        </p>
      </Card>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Histórico de conversas">
        {historyError ? (
          <p className="text-sm text-ink-secondary">O histórico ainda está sendo configurado. Tente novamente em instantes.</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-ink-secondary">Suas conversas aparecem aqui depois da primeira pergunta.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conversations.map((c) => (
              <li key={c.id} className="glass flex items-center gap-2 rounded-2xl p-3">
                <button onClick={() => void openConversation(c)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-ink-primary">{c.title}</p>
                  <p className="text-xs text-ink-muted">{new Date(c.updated_at).toLocaleDateString('pt-BR')}</p>
                </button>
                <button
                  onClick={() => setDeleting(c)}
                  className="text-ink-muted hover:text-danger"
                  aria-label="Apagar conversa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Apagar conversa"
        description={`Apagar "${deleting?.title}"? As mensagens dela serão removidas.`}
        confirmLabel="Apagar"
        loading={removeConversation.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <RenameModal key={name} open={settingsOpen} onClose={() => setSettingsOpen(false)} current={name} />
    </div>
  )
}

export function AssistantPage() {
  const { profile } = useAuth()

  if (!canUseFeature(profile, 'assistant')) {
    const min = featureMinPlan('assistant')
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-ink-primary">Assistente</h1>
        <Card className="flex flex-col items-start gap-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink-primary">Disponível no plano {min.name}</p>
            <p className="mt-1 text-sm text-ink-secondary">
              Uma assistente financeira só sua, com o nome que você escolher, para ajudar a entender e organizar seu dinheiro.
            </p>
          </div>
          <Link
            to="/subscription"
            className="inline-flex h-11 items-center rounded-full bg-brand-gradient px-6 text-sm font-semibold text-[#04241C]"
          >
            Ver planos
          </Link>
        </Card>
      </div>
    )
  }

  if (!profile?.agent_name) return <NameSetup />
  return <Conversation name={profile.agent_name} />
}
