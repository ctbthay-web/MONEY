import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, User } from 'lucide-react'
import { AuthLayout } from '../features/auth/AuthLayout'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authErrors'
import { checkoutHref } from '../lib/plans'
import { parsePlanParam, setPendingPlan } from '../lib/pendingPlan'
import { formatCentsToBRL } from '../lib/format'
import { LEGAL } from '../lib/legal'
import { track, trackOnce } from '../lib/track'

const schema = z
  .object({
    fullName: z.string().min(2, 'Informe seu nome completo'),
    // Provisório: enquanto o envio de e-mails sai de um remetente Gmail (sem domínio próprio), Yahoo/Outlook podem
    // barrar a confirmação. Só o cadastro exige Gmail; login e recuperação de senha seguem aceitando qualquer e-mail.
    email: z
      .string()
      .trim()
      .min(1, 'Informe seu e-mail')
      .email('E-mail inválido')
      .refine((v) => /@(gmail|googlemail)\.com$/i.test(v), {
        message: 'Por enquanto o cadastro aceita só e-mails do Gmail (terminados em @gmail.com).',
      }),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme sua senha'),
    accepted: z.boolean().refine((v) => v, { message: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const navigate = useNavigate()
  // plano escolhido na página de vendas (?plan=...): depois do cadastro a pessoa vai direto ao pagamento dele
  const [searchParams] = useSearchParams()
  const chosenPlan = parsePlanParam(searchParams.get('plan'))
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  // e-mail que já tinha conta: guardado para enviar o link de nova senha com um clique
  const [existingEmail, setExistingEmail] = useState('')
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetError, setResetError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { accepted: false } })

  useEffect(() => {
    trackOnce('funnel', 'register_view', { planId: chosenPlan?.id })
  }, [chosenPlan?.id])

  async function onSubmit(values: FormValues) {
    setFormError(null)
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        // guarda o aceite dos Termos/Política (data e versão) junto da conta
        // chosen_plan: plano escolhido na venda, guardado na própria conta (só destaca o checkout certo; não dá acesso a nada)
        data: {
          full_name: values.fullName,
          accepted_terms_at: new Date().toISOString(),
          terms_version: LEGAL.termsVersion,
          ...(chosenPlan ? { chosen_plan: chosenPlan.id } : {}),
        },
        // ao clicar em "confirmar" no e-mail, volta ao app com o plano escolhido e segue direto para o pagamento
        emailRedirectTo: chosenPlan ? `${window.location.origin}/?plan=${chosenPlan.id}` : window.location.origin,
      },
    })
    if (error) {
      setFormError(translateAuthError(error.message))
      return
    }
    if (chosenPlan) setPendingPlan(chosenPlan.id)
    // E-mail que já tem conta: por segurança o Supabase responde "sucesso" mas NÃO envia e-mail (identities vem vazio).
    // Sem tratar isso a pessoa fica esperando um e-mail que nunca chega.
    if (!data.session && Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
      track('funnel', 'signup_existing', { planId: chosenPlan?.id })
      setExistingEmail(values.email)
      setAlreadyRegistered(true)
      return
    }
    track('funnel', 'signup_done', { planId: chosenPlan?.id })
    if (data.session) {
      // conta criada e já logada: segue para o pagamento do plano escolhido (Kiwify), com o e-mail da conta
      const pay = chosenPlan ? checkoutHref(chosenPlan.checkoutUrl, values.email, data.user?.id) : ''
      if (pay) {
        track('funnel', 'checkout_redirect', { planId: chosenPlan?.id, meta: { via: 'signup' } })
        window.location.href = pay
        return
      }
      navigate('/', { replace: true })
      return
    }
    setSuccess(true)
  }

  async function sendResetLink() {
    setResetError(null)
    setResetState('sending')
    const { error } = await supabase.auth.resetPasswordForEmail(existingEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setResetError(translateAuthError(error.message))
      setResetState('idle')
      return
    }
    setResetState('sent')
  }

  if (alreadyRegistered) {
    return (
      <AuthLayout title="Você já tem cadastro" subtitle="Esse e-mail já foi usado">
        <p className="text-center text-sm text-ink-secondary">
          Já existe uma conta com esse e-mail, por isso não enviamos um novo e-mail de confirmação.
          {chosenPlan ? ` Entre na sua conta para seguir ao pagamento do plano ${chosenPlan.name}.` : ' Entre na sua conta para continuar.'}
        </p>
        <Link to="/login">
          <Button className="mt-6 w-full" size="lg">
            Entrar na minha conta
          </Button>
        </Link>
        <p className="mt-4 text-center text-sm text-ink-secondary">
          Não lembra a senha ou ainda não concluiu o pagamento? Receba um link para criar uma nova senha e continuar com esse mesmo e-mail.
        </p>
        {resetState === 'sent' ? (
          <p className="mt-3 rounded-2xl border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-center text-sm text-ink-primary">
            Enviamos o link para <span className="font-semibold">{existingEmail}</span>. Confira também o spam.
          </p>
        ) : (
          <Button type="button" variant="secondary" className="mt-3 w-full" loading={resetState === 'sending'} onClick={sendResetLink}>
            Enviar link para criar nova senha
          </Button>
        )}
        {resetError && (
          <p className="mt-3 rounded-2xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{resetError}</p>
        )}
      </AuthLayout>
    )
  }

  if (success) {
    return (
      <AuthLayout title="Confira seu e-mail" subtitle="Falta pouco para começar">
        <p className="text-center text-sm text-ink-secondary">
          Enviamos um link de confirmação para o seu e-mail. Confirme o cadastro e depois faça login
          {chosenPlan ? `. Ao confirmar, você já cai na página de pagamento do plano ${chosenPlan.name}.` : '.'}
        </p>
        <p className="mt-3 rounded-2xl border border-border px-3 py-2 text-center text-xs text-ink-secondary">
          O e-mail chega com o assunto <span className="font-semibold text-ink-primary">“Confirme seu e-mail no Money”</span>. Se não aparecer em alguns minutos, olhe a caixa de spam ou lixo eletrônico. O link vale por 1 hora.
        </p>
        <Link to="/login">
          <Button className="mt-6 w-full" size="lg">
            Ir para o login
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Criar conta" subtitle="Comece a organizar suas finanças">
      {chosenPlan && (
        <p className="mb-4 rounded-2xl border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-center text-sm text-ink-primary">
          Plano <span className="font-semibold">{chosenPlan.name}</span> · primeira cobrança {formatCentsToBRL(chosenPlan.firstChargeCents)}.
          <span className="block text-xs text-ink-secondary">Depois de criar a conta você vai para o pagamento.</span>
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="Nome completo"
          placeholder="Seu nome"
          leftIcon={<User className="h-4 w-4" />}
          error={errors.fullName?.message}
          autoComplete="name"
          {...register('fullName')}
        />
        <Input
          label="E-mail"
          type="email"
          placeholder="voce@gmail.com"
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          autoComplete="email"
          {...register('email')}
        />
        <Input
          label="Senha"
          type="password"
          placeholder="Mínimo 6 caracteres"
          leftIcon={<Lock className="h-4 w-4" />}
          error={errors.password?.message}
          autoComplete="new-password"
          {...register('password')}
        />
        <Input
          label="Confirmar senha"
          type="password"
          placeholder="••••••••"
          leftIcon={<Lock className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
          {...register('confirmPassword')}
        />

        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2.5 text-sm text-ink-secondary">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-400" {...register('accepted')} />
            <span>
              Li e aceito os{' '}
              <Link to="/termos" target="_blank" className="font-semibold text-brand-300 hover:text-brand-200">Termos de Uso</Link> e a{' '}
              <Link to="/privacidade" target="_blank" className="font-semibold text-brand-300 hover:text-brand-200">Política de Privacidade</Link>.
            </span>
          </label>
          {errors.accepted?.message && <span className="text-xs text-danger">{errors.accepted.message}</span>}
        </div>

        {formError && (
          <p className="rounded-2xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Criar conta
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-secondary">
        Já tem conta?{' '}
        <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}
