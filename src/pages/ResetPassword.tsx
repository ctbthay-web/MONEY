import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock } from 'lucide-react'
import { AuthLayout } from '../features/auth/AuthLayout'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authErrors'

const schema = z
  .object({
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme sua senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
type FormValues = z.infer<typeof schema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setFormError(null)
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setFormError(translateAuthError(error.message))
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout title="Nova senha" subtitle="Defina sua nova senha de acesso">
      {!ready && (
        <p className="mb-4 rounded-2xl border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
          Abra esta página pelo link enviado no e-mail de recuperação.
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="Nova senha"
          type="password"
          placeholder="Mínimo 6 caracteres"
          leftIcon={<Lock className="h-4 w-4" />}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          placeholder="••••••••"
          leftIcon={<Lock className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        {formError && (
          <p className="rounded-2xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Salvar nova senha
        </Button>
      </form>
    </AuthLayout>
  )
}
