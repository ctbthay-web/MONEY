import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import { useAuth } from '../../features/auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { formatCentsToBRL } from '../../lib/format'
import { LEGAL, supportMailto, supportWhatsappUrl } from '../../lib/legal'

type Check = {
  eligible: boolean
  reason: 'expired' | 'method' | 'already_refunded' | 'no_sale' | 'not_configured' | 'refund_failed' | 'error' | null
  amount_cents: number | null
  deadline: string | null
}

async function callRefund(body: object): Promise<{ status: number; json: Check & { refunded?: boolean } }> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/billing-refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ eligible: false, reason: 'error', amount_cents: null, deadline: null }))
  return { status: res.status, json }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

function reasonText(c: Check): string {
  switch (c.reason) {
    case 'expired':
      return `O prazo de 7 dias depois do último pagamento terminou${c.deadline ? ` em ${fmtDate(c.deadline)}` : ''}. Se tiver um motivo especial, fale com a gente.`
    case 'method':
      return 'Pagamentos por boleto precisam de dados bancários para devolver o valor, então o reembolso é feito pelo suporte.'
    case 'already_refunded':
      return 'Você já recebeu um reembolso antes. Para um novo pedido, fale com a gente.'
    case 'refund_failed':
      return 'Não conseguimos concluir o reembolso automático agora. Nenhum valor foi cobrado a mais. Peça pelo suporte que resolvemos.'
    default:
      return 'Não conseguimos fazer o reembolso automático para esta conta. Peça pelo suporte que resolvemos.'
  }
}

/**
 * Reembolso automático (api/billing-refund): dentro de 7 dias do último pagamento, cartão ou Pix, um por pessoa.
 * Fora disso, mostra o motivo e os contatos de suporte. Reembolsar também cancela a assinatura na Kiwify.
 */
export function RefundModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refreshProfile } = useAuth()
  const toast = useToast()
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setCheck(null)
    callRefund({}).then(({ json }) => alive && setCheck(json))
    return () => {
      alive = false
    }
  }, [open])

  async function refund() {
    setBusy(true)
    const { json } = await callRefund({ confirm: true })
    setBusy(false)
    if (json.refunded) {
      toast.success('Reembolso feito. O valor volta pela mesma forma de pagamento.')
      onClose()
      await refreshProfile()
      return
    }
    setCheck({ ...json, eligible: false })
  }

  const amount = check?.amount_cents != null ? formatCentsToBRL(check.amount_cents) : null

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Pedir reembolso">
      <div className="flex flex-col gap-4 text-sm text-ink-secondary">
        {!check && <p>Conferindo seu último pagamento…</p>}

        {check?.eligible && (
          <>
            <p>
              Você está dentro do prazo de 7 dias
              {check.deadline ? ` (até ${fmtDate(check.deadline)})` : ''}. Ao confirmar:
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                {amount ? (
                  <>
                    <strong className="text-ink-primary">{amount}</strong> volta
                  </>
                ) : (
                  'O valor volta'
                )}{' '}
                pela mesma forma de pagamento (no cartão, pode levar até a próxima fatura);
              </li>
              <li>
                a assinatura é cancelada e o <strong className="text-ink-primary">acesso termina agora</strong>;
              </li>
              <li>seus dados continuam salvos e voltam se você assinar de novo.</li>
            </ul>
            <Button variant="danger" loading={busy} onClick={refund} className="self-start">
              Confirmar reembolso
            </Button>
          </>
        )}

        {check && !check.eligible && (
          <>
            <p>{reasonText(check)}</p>
            {(LEGAL.supportWhatsapp || LEGAL.supportEmail) && (
              <div className="rounded-2xl border border-border p-3">
                <p className="mb-2 font-medium text-ink-primary">Peça o reembolso para nós:</p>
                <div className="flex flex-wrap gap-3">
                  {LEGAL.supportWhatsapp && (
                    <a
                      href={supportWhatsappUrl(`Olá! Quero pedir o reembolso da minha assinatura do Money. Meu e-mail: ${user?.email ?? ''}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-400 underline"
                    >
                      Pedir pelo WhatsApp
                    </a>
                  )}
                  {LEGAL.supportEmail && (
                    <a
                      href={supportMailto(`Reembolso assinatura Money - ${user?.email ?? ''}`)}
                      className="font-medium text-brand-400 underline"
                    >
                      Pedir por e-mail
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
