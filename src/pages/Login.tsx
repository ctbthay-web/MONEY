import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock } from 'lucide-react'
import { AuthLayout } from '../features/auth/AuthLayout'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authErrors'
import { IDLE_LIMIT_MIN, setRemember, takeLogoutReason } from '../lib/sessionPolicy'

const schema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
  remember: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const MAX_ATTEMPTS = 5
const LOCK_SECONDS = 30

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const [idleNotice] = useState(() => takeLogoutReason() === 'idle')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { remember: false } })

  useEffect(() => {
    if (!lockedUntil) return
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setSecondsLeft(0)
      } else {
        setSecondsLeft(remaining)
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [lockedUntil])

  const isLocked = Boolean(lockedUntil && secondsLeft > 0)

  async function onSubmit(values: FormValues) {
    if (isLocked) return
    setFormError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
    if (error) {
      const nextAttempts = failedAttempts + 1
      setFailedAttempts(nextAttempts)
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCK_SECONDS * 1000)
        setFailedAttempts(0)
        setFormError(`Muitas tentativas. Aguarde ${LOCK_SECONDS} segundos antes de tentar de novo.`)
      } else {
        setFormError(translateAuthError(error.message))
      }
      return
    }
    setFailedAttempts(0)
    setRemember(values.remember)
    const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/'
    navigate(redirectTo, { replace: true })
  }

  return (
    <AuthLayout title="Entrar" subtitle="Acesse sua conta Money">
      {idleNotice && (
        <p className="mb-4 rounded-2xl border border-border px-3 py-2 text-center text-sm text-ink-secondary">
          Por segurança, saímos da sua conta depois de {IDLE_LIMIT_MIN} minutos sem uso. Entre de novo para continuar.
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="E-mail"
          type="email"
          placeholder="voce@email.com"
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          autoComplete="email"
          {...register('email')}
        />
        <Input
          label="Senha"
          type="password"
          placeholder="••••••••"
          leftIcon={<Lock className="h-4 w-4" />}
          error={errors.password?.message}
          autoComplete="current-password"
          {...register('password')}
        />
        <div className="-mt-1 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-400" {...register('remember')} />
            Manter conectado
          </label>
          <Link to="/forgot-password" className="text-xs font-medium text-brand-300 hover:text-brand-200">
            Esqueceu a senha?
          </Link>
        </div>

        {formError && (
          <p className="rounded-2xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
            {isLocked ? ` (${secondsLeft}s)` : ''}
          </p>
        )}

        <Button type="submit" size="lg" loading={isSubmitting} disabled={isLocked} className="mt-2 w-full">
          {isLocked ? `Aguarde ${secondsLeft}s` : 'Entrar'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-secondary">
        Não tem conta?{' '}
        <Link to="/register" className="font-semibold text-brand-300 hover:text-brand-200">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  )
}
