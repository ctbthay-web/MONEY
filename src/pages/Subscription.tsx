import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, Sparkles } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { PlanCards } from '../components/finance/PlanCards'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { computeAccess } from '../lib/access'
import { effectivePlan, planById } from '../lib/plans'
import { LEGAL, supportMailto, supportWhatsappUrl } from '../lib/legal'

function fmt(d: Date) {
  return d.toLocaleDateString('pt-BR')
}

async function callBilling(path: string, body?: unknown) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Não foi possível concluir. Tente novamente.')
  return json
}

/** Lançamentos usados no mês e o limite do plano (lim null = sem limite). */
function useTxUsage(enabled: boolean) {
  return useQuery({
    queryKey: ['tx-usage'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tx_usage')
      if (error) throw new Error(error.message)
      const row = Array.isArray(data) ? data[0] : data
      return { used: Number(row?.used ?? 0), lim: row?.lim == null ? null : Number(row.lim) }
    },
  })
}

export function SubscriptionPage() {
  const { profile, user, refreshProfile } = useAuth()
  const toast = useToast()
  const access = computeAccess(profile)
  const [loading, setLoading] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [kiwifyCancelOpen, setKiwifyCancelOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)

  const canceled = profile?.billing_status === 'canceled'
  const provider = profile?.billing_provider
  const paidPlan = access?.kind === 'active' ? planById(profile?.plan_id) : null
  const plan = effectivePlan(profile)
  const { data: usage } = useTxUsage(access?.kind === 'active')

  // Ao voltar da página de pagamento da Kiwify, recarrega o perfil para o plano novo aparecer sem precisar sair e entrar.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshProfile()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refreshProfile])

  const status = (() => {
    if (!access) return null
    switch (access.kind) {
      case 'admin':
        return { title: 'Administrador', text: 'Você tem acesso completo, sem cobrança.', ok: true }
      case 'lifetime':
        return { title: 'Uso vitalício', text: 'Seu acesso é vitalício. Você não precisa assinar nada.', ok: true }
      case 'active':
        return {
          title: `${paidPlan ? `Plano ${paidPlan.name}` : 'Assinatura ativa'}${canceled ? ' — renovação cancelada' : ''}`,
          text: canceled
            ? `Você não será mais cobrado. O acesso continua até ${fmt(access.until)}.`
            : `Acesso garantido até ${fmt(access.until)}. A renovação é mensal.`,
          ok: true,
        }
      case 'expired':
        return {
          title: profile?.paid_until ? 'Acesso encerrado' : 'Escolha seu plano',
          text: profile?.paid_until
            ? 'Seu acesso terminou. Você continua vendo seus dados, mas para registrar e editar é preciso assinar.'
            : 'Escolha um plano para começar a registrar suas movimentações.',
          ok: false,
        }
      case 'blocked':
        return { title: 'Conta desativada', text: 'Fale com o suporte para reativar sua conta.', ok: false }
    }
  })()

  const showPlans = access && !['admin', 'lifetime', 'blocked'].includes(access.kind)

  async function cancel() {
    setLoading(true)
    try {
      await callBilling('/api/billing-cancel')
      await refreshProfile()
      toast.success('Renovação cancelada. Seu acesso continua até o fim do período pago.')
      setCancelOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar.')
    } finally {
      setLoading(false)
    }
  }

  const pct = usage?.lim ? Math.min(100, Math.round((usage.used / usage.lim) * 100)) : 0

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-primary">Assinatura</h1>
        {status && <p className="mt-1 text-sm text-ink-secondary">{status.title}</p>}
      </div>

      {status && (
        <Card glow={status.ok} className="p-5">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                status.ok ? 'bg-brand-500/15 text-brand-300' : 'bg-danger-soft text-danger'
              }`}
            >
              {access?.kind === 'lifetime' || access?.kind === 'admin' ? <Crown className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink-primary">{status.title}</p>
              <p className="mt-1 text-sm text-ink-secondary">{status.text}</p>
            </div>
          </div>
        </Card>
      )}

      {usage && usage.lim !== null && (
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-ink-secondary">Lançamentos deste mês</p>
            <p className="font-display text-lg font-bold text-ink-primary">
              {usage.used} <span className="text-sm font-medium text-ink-secondary">de {usage.lim}</span>
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-brand-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {usage.used >= usage.lim
              ? 'Você atingiu o limite do mês. Faça upgrade para continuar lançando.'
              : 'Parcelamentos e recorrências contam como um lançamento. O contador zera todo mês.'}
          </p>
        </Card>
      )}

      {showPlans && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-ink-primary">
              {access?.kind === 'active' ? 'Mudar de plano' : 'Escolha seu plano'}
            </h2>
            <p className="mt-1 text-sm text-ink-secondary">
              O pagamento é feito na página segura da Kiwify (Pix, cartão ou boleto). Use o mesmo e-mail da sua conta
              {user?.email ? ` (${user.email})` : ''} para o plano ser liberado automaticamente.
            </p>
          </div>
          <PlanCards mode="app" currentPlanId={plan !== 'all' ? plan : null} email={user?.email} userId={user?.id} />
        </section>
      )}

      {access?.kind === 'active' && provider === 'kiwify' && (
        <p className="rounded-2xl border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
          Ao mudar de plano você cria uma assinatura nova na Kiwify. Depois de pagar, cancele a assinatura anterior pelo link
          de gerenciar assinatura no e-mail da compra antiga, para não ser cobrado duas vezes.
        </p>
      )}

      {access?.kind === 'active' && provider === 'kiwify' && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {!canceled && (
            <button
              onClick={() => setKiwifyCancelOpen(true)}
              className="text-sm font-medium text-ink-secondary hover:text-danger"
            >
              Cancelar assinatura
            </button>
          )}
          <button onClick={() => setRefundOpen(true)} className="text-sm font-medium text-ink-secondary hover:text-danger">
            Pedir reembolso
          </button>
        </div>
      )}

      {access?.kind === 'active' && !canceled && provider === 'asaas' && (
        <button onClick={() => setCancelOpen(true)} className="self-start text-sm font-medium text-ink-secondary hover:text-danger">
          Cancelar renovação
        </button>
      )}

      <Modal open={kiwifyCancelOpen} onClose={() => setKiwifyCancelOpen(false)} title="Cancelar assinatura">
        <div className="flex flex-col gap-4 text-sm text-ink-secondary">
          <p>
            Sua assinatura é renovada todo mês pela Kiwify. Ao cancelar, você não é mais cobrado e{' '}
            <strong className="text-ink-primary">continua com acesso até o fim do período já pago</strong>
            {profile?.paid_until ? ` (${fmt(new Date(profile.paid_until))})` : ''}.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              Abra o e-mail de confirmação da compra que a Kiwify enviou para{' '}
              <strong className="text-ink-primary">{user?.email}</strong> e toque em gerenciar assinatura.
            </li>
            <li>
              Ou entre em{' '}
              <a
                href="https://dashboard.kiwify.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-400 underline"
              >
                dashboard.kiwify.com.br
              </a>{' '}
              com esse mesmo e-mail, abra suas compras/assinaturas e cancele a do Money.
            </li>
          </ol>
          {(LEGAL.supportWhatsapp || LEGAL.supportEmail) && (
            <div className="rounded-2xl border border-border p-3">
              <p className="mb-2">Não conseguiu? Peça para nós e cancelamos para você:</p>
              <div className="flex flex-wrap gap-3">
                {LEGAL.supportWhatsapp && (
                  <a
                    href={supportWhatsappUrl(`Olá! Quero cancelar minha assinatura do Money. Meu e-mail: ${user?.email ?? ''}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-400 underline"
                  >
                    Pedir pelo WhatsApp
                  </a>
                )}
                {LEGAL.supportEmail && (
                  <a
                    href={supportMailto(`Cancelar assinatura Money - ${user?.email ?? ''}`)}
                    className="font-medium text-brand-400 underline"
                  >
                    Pedir por e-mail
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Pedir reembolso">
        <div className="flex flex-col gap-4 text-sm text-ink-secondary">
          <p>
            Você pode pedir o reembolso em até <strong className="text-ink-primary">7 dias depois de cada pagamento</strong>{' '}
            (direito de arrependimento do Código de Defesa do Consumidor). O valor volta pela mesma forma de pagamento.
          </p>
          <p>
            Com o reembolso, o <strong className="text-ink-primary">acesso ao app termina na hora</strong>. Seus dados
            continuam salvos e voltam a aparecer se você assinar de novo.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              Abra o e-mail de confirmação da compra que a Kiwify enviou para{' '}
              <strong className="text-ink-primary">{user?.email}</strong> e procure a opção de reembolso ou ajuda com a compra.
            </li>
            <li>
              Ou entre em{' '}
              <a
                href="https://dashboard.kiwify.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-400 underline"
              >
                dashboard.kiwify.com.br
              </a>{' '}
              com esse mesmo e-mail, abra suas compras e peça o reembolso da do Money.
            </li>
          </ol>
          {(LEGAL.supportWhatsapp || LEGAL.supportEmail) && (
            <div className="rounded-2xl border border-border p-3">
              <p className="mb-2">Prefere que a gente faça? Peça aqui:</p>
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
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancelar renovação"
        description="Você não será mais cobrado. Seu acesso continua até o fim do período já pago."
        confirmLabel="Cancelar renovação"
        loading={loading}
        onConfirm={cancel}
        onClose={() => setCancelOpen(false)}
      />
    </div>
  )
}
