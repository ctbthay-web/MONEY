import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail } from 'lucide-react'
import { AuthLayout } from '../features/auth/AuthLayout'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authErrors'

const schema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
})
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setFormError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setFormError(translateAuthError(error.message))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Verifique seu e-mail" subtitle="Enviamos as instruções">
        <p className="text-center text-sm text-ink-secondary">
          Se houver uma conta com esse e-mail, você receberá um link para redefinir sua senha.
        </p>
        <p className="mt-3 rounded-2xl border border-border px-3 py-2 text-center text-xs text-ink-secondary">
          Se não aparecer em alguns minutos, olhe as abas <span className="font-semibold text-ink-primary">Spam</span> e{' '}
          <span className="font-semibold text-ink-primary">Promoções</span> do Gmail.
        </p>
        <Link to="/login">
          <Button className="mt-6 w-full" size="lg">
            Voltar ao login
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link de redefinição">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="E-mail"
          type="email"
          placeholder="voce@email.com"
          leftIcon={<Mail className="h-4 w-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        {formError && (
          <p className="rounded-2xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Enviar link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-secondary">
        <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
          Voltar ao login
        </Link>
      </p>
    </AuthLayout>
  )
}
