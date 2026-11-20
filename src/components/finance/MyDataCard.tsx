import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { SupportLinks } from '../ui/SupportLinks'
import { useAuth } from '../../features/auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { buildExport, downloadText } from '../../lib/dataExport'
import { hasSupport } from '../../lib/legal'
import { formatDate } from '../../lib/format'

/** Perfil → Meus dados: cópia dos dados (portabilidade), exclusão da conta e links legais/suporte (LGPD). */
export function MyDataCard() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const hasPaidPeriod = Boolean(profile?.paid_until && new Date(profile.paid_until) > new Date() && !profile.is_lifetime)

  async function exportData() {
    if (!user) return
    setExporting(true)
    try {
      const result = await buildExport(user)
      downloadText(result.filename, result.json)
      const total = Object.values(result.counts).reduce((s, n) => s + n, 0)
      toast.success(`Arquivo gerado com ${total} registros.`)
    } catch {
      toast.error('Não foi possível gerar o arquivo agora. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  async function deleteAccount() {
    if (confirmText.trim() !== 'EXCLUIR') return
    setDeleting(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Faça login novamente para excluir a conta.')
      const res = await fetch('/api/account-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: 'EXCLUIR' }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Não foi possível excluir a conta agora.')
      toast.success('Conta excluída. Seus dados foram apagados.')
      setDeleteOpen(false)
      await signOut()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir a conta agora.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-ink-secondary">Meus dados e privacidade</h2>
      <p className="mb-4 text-xs text-ink-muted">Os dados são seus. Baixe uma cópia ou exclua sua conta quando quiser.</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-primary">Exportar meus dados</p>
            <p className="text-xs text-ink-secondary">Arquivo JSON com contas, movimentações, metas, empréstimos e o restante.</p>
          </div>
          <Button variant="secondary" size="sm" loading={exporting} onClick={exportData}>
            <Download className="h-4 w-4" /> Baixar
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-primary">Excluir minha conta</p>
            <p className="text-xs text-ink-secondary">Apaga sua conta e todos os seus dados. Não dá para desfazer.</p>
          </div>
          <Button variant="secondary" size="sm" className="text-danger" onClick={() => { setConfirmText(''); setDeleteOpen(true) }} disabled={isAdmin}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        </div>
        {isAdmin && <p className="text-xs text-ink-muted">Contas de administrador não podem ser excluídas por aqui.</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
          <Link to="/termos" className="inline-flex items-center gap-1.5 font-medium text-brand-300 hover:text-brand-200">
            <FileText className="h-4 w-4" /> Termos de Uso
          </Link>
          <Link to="/privacidade" className="inline-flex items-center gap-1.5 font-medium text-brand-300 hover:text-brand-200">
            <FileText className="h-4 w-4" /> Política de Privacidade
          </Link>
          {hasSupport && <SupportLinks />}
        </div>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Excluir minha conta">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-secondary">
            Isso apaga <span className="font-semibold text-ink-primary">para sempre</span> sua conta e tudo o que está nela: contas, movimentações, metas,
            empréstimos, orçamentos e histórico. Se quiser guardar uma cópia, baixe seus dados antes.
          </p>
          {hasPaidPeriod && (
            <p className="rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              Sua assinatura está paga até {formatDate(profile!.paid_until!.slice(0, 10))}. Excluir a conta <strong>não cancela a cobrança</strong>: cancele
              também a renovação na Kiwify (pelo e-mail da compra), senão a assinatura continua sendo cobrada.
            </p>
          )}
          <Input
            label="Para confirmar, digite EXCLUIR"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
          <Button
            size="lg"
            className="w-full bg-danger text-white hover:brightness-110"
            loading={deleting}
            disabled={confirmText.trim() !== 'EXCLUIR'}
            onClick={deleteAccount}
          >
            Excluir minha conta definitivamente
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
