import { useState } from 'react'
import { Bell, BellOff, CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Switch } from '../ui/Switch'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/Toast'
import {
  useNotificationPrefs,
  useSavePrefs,
  useScheduleMutations,
  useSchedules,
  type NotificationPrefs,
  type NotificationSchedule,
  type ScheduleFrequency,
} from '../../lib/queries/useNotifications'
import {
  pushPermission,
  showTestNotification,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '../../lib/push'
import { formatDate, todayISO } from '../../lib/format'
import { useFeatureGate } from '../../lib/useFeatureGate'

const FREQ_LABEL: Record<ScheduleFrequency, string> = {
  once: 'Uma vez',
  daily: 'Todo dia',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
}

const CATEGORIES: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'notify_due', label: 'Contas a pagar', hint: 'Vencendo e atrasadas, com nome e valor' },
  { key: 'notify_receivable', label: 'Recebimentos', hint: 'O que você tem para receber hoje' },
  { key: 'notify_cards', label: 'Faturas de cartão', hint: 'Valor da fatura e vencimento' },
  { key: 'notify_goals', label: 'Metas', hint: 'Quando atinge 25%, 50%, 80% e 100%' },
  { key: 'notify_summary', label: 'Resumo do mês', hint: 'No último dia do mês: quanto entrou e saiu' },
]

interface FormState {
  title: string
  message: string
  frequency: ScheduleFrequency
  start_date: string
  send_time: string
}

const emptyForm = (): FormState => ({ title: '', message: '', frequency: 'once', start_date: todayISO(), send_time: '09:00' })

export function NotificationSettings() {
  const toast = useToast()
  const guard = useFeatureGate()
  const { data: prefs, isError } = useNotificationPrefs()
  const save = useSavePrefs()
  const { data: schedules = [] } = useSchedules()
  const { create, update, remove } = useScheduleMutations()
  const [permission, setPermission] = useState(pushPermission())
  const [editing, setEditing] = useState<NotificationSchedule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleting, setDeleting] = useState<NotificationSchedule | null>(null)

  if (!prefs) {
    return (
      <p className="text-sm text-ink-secondary">
        {isError ? 'As notificações ainda estão sendo configuradas. Tente novamente em instantes.' : 'Carregando…'}
      </p>
    )
  }

  async function toggleEnabled(value: boolean) {
    try {
      await save.mutateAsync({ enabled: value })
      if (value) {
        const result = await subscribeThisDevice()
        setPermission(pushPermission())
        if (result === 'denied') toast.info('Notificações ativadas, mas o navegador está bloqueando. Libere nas permissões do site.')
        else if (result === 'unsupported') toast.info('Este aparelho não suporta notificações. No iPhone, instale o app na tela inicial.')
        else if (result === 'error') toast.error('Não foi possível ativar neste aparelho agora.')
        else toast.success('Notificações ativadas.')
      } else {
        await unsubscribeThisDevice()
        toast.success('Notificações desativadas.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  function openNew() {
    if (!guard('schedules')) return
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEdit(s: NotificationSchedule) {
    setEditing(s)
    setForm({
      title: s.title,
      message: s.message ?? '',
      frequency: s.frequency,
      start_date: s.start_date,
      send_time: s.send_time.slice(0, 5),
    })
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.title.trim()) {
      toast.error('Dê um título para a programação.')
      return
    }
    const input = {
      title: form.title.trim(),
      message: form.message.trim() || null,
      frequency: form.frequency,
      start_date: form.start_date,
      send_time: form.send_time,
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input })
      else await create.mutateAsync(input)
      toast.success(editing ? 'Programação atualizada.' : 'Programação criada.')
      setFormOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar a programação.')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Programação excluída.')
      setDeleting(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir.')
    }
  }

  const blocked = permission === 'denied'
  const unsupported = permission === 'unsupported'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
          {prefs.enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-primary">Notificações</p>
          <p className="text-xs text-ink-secondary">{prefs.enabled ? 'Ativado' : 'Desativado'}</p>
        </div>
        <Switch checked={prefs.enabled} onChange={toggleEnabled} label="Ativar notificações" disabled={save.isPending} />
      </div>

      {prefs.enabled && blocked && (
        <p className="rounded-2xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          O navegador está bloqueando as notificações deste site. Libere em Configurações do navegador → Permissões do site →
          Notificações.
        </p>
      )}
      {prefs.enabled && unsupported && (
        <p className="rounded-2xl border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
          Este aparelho não recebe notificações pelo navegador. No iPhone, abra o Money no Safari, toque em Compartilhar →
          Adicionar à Tela de Início e abra por lá.
        </p>
      )}

      {prefs.enabled && (
        <>
          <div className="flex flex-col gap-1">
            <p className="mb-1 text-sm font-medium text-ink-secondary">O que avisar</p>
            {CATEGORIES.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-2xl px-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-primary">{c.label}</p>
                  <p className="text-xs text-ink-muted">{c.hint}</p>
                </div>
                <Switch
                  checked={Boolean(prefs[c.key])}
                  onChange={(v) => save.mutate({ [c.key]: v })}
                  label={c.label}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Avisar contas com antecedência"
              value={prefs.days_before}
              onChange={(e) => save.mutate({ days_before: Number(e.target.value) })}
            >
              <option value={0}>Só no dia do vencimento</option>
              {[1, 2, 3, 5, 7].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? 'dia' : 'dias'} antes (e no dia)
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={async () => {
              const ok = await showTestNotification()
              if (!ok) toast.info('Ative a permissão de notificações do navegador para testar.')
            }}
          >
            <Bell className="h-4 w-4" />
            Enviar notificação de teste
          </Button>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink-secondary">Programações</p>
              <Button type="button" size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Nova
              </Button>
            </div>
            {schedules.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Crie lembretes seus: escolha título, data e a frequência (uma vez, todo dia, toda semana ou todo mês).
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {schedules.map((s) => (
                  <li key={s.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                    <CalendarClock className="h-5 w-5 shrink-0 text-brand-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-primary">{s.title}</p>
                      <p className="truncate text-xs text-ink-secondary">
                        {FREQ_LABEL[s.frequency]} · {s.frequency === 'once' ? formatDate(s.start_date) : `desde ${formatDate(s.start_date)}`}
                        {!s.active && ' · pausada'}
                      </p>
                    </div>
                    <Switch
                      checked={s.active}
                      onChange={(v) => update.mutate({ id: s.id, input: { active: v } })}
                      label={`Programação ${s.title} ativa`}
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="text-ink-muted hover:text-ink-primary"
                      aria-label="Editar programação"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(s)}
                      className="text-ink-muted hover:text-danger"
                      aria-label="Excluir programação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar programação' : 'Nova programação'}>
        <div className="flex flex-col gap-4">
          <Input label="Título" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input
            label="Mensagem (opcional)"
            value={form.message}
            maxLength={200}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
          <Select
            label="Frequência"
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value as ScheduleFrequency })}
          >
            {(Object.keys(FREQ_LABEL) as ScheduleFrequency[]).map((f) => (
              <option key={f} value={f}>
                {FREQ_LABEL[f]}
              </option>
            ))}
          </Select>
          <Input
            label={form.frequency === 'once' ? 'Data' : 'A partir de'}
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" type="button" loading={create.isPending || update.isPending} onClick={submitForm}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir programação"
        description={`Excluir "${deleting?.title}"? Ela não será mais enviada.`}
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
