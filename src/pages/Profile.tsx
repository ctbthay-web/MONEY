import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogOut, Shield, User, Lock } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../features/auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { translateAuthError } from '../lib/authErrors'
import { computeAccess } from '../lib/access'
import { ThemeSettings } from '../components/ui/ThemeSettings'
import { NotificationSettings } from '../components/finance/NotificationSettings'
import { MyDataCard } from '../components/finance/MyDataCard'

const profileSchema = z.object({
  fullName: z.string().min(2, 'Informe seu nome completo'),
})
type ProfileFormValues = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
type PasswordFormValues = z.infer<typeof passwordSchema>

export function ProfilePage() {
  const { user, profile, isAdmin, signOut, refreshProfile } = useAuth()
  const toast = useToast()
  const [savingProfile, setSavingProfile] = useState(false)

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: profile?.full_name ?? '' },
  })

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) })

  async function onSaveProfile(values: ProfileFormValues) {
    setSavingProfile(true)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: values.fullName }).eq('id', user!.id)
      if (error) throw error
      await refreshProfile()
      toast.success('Perfil atualizado.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar perfil.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function onChangePassword(values: PasswordFormValues) {
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password })
      if (error) throw error
      toast.success('Senha alterada com sucesso.')
      resetPasswordForm()
    } catch (err) {
      toast.error(err instanceof Error ? translateAuthError(err.message) : 'Erro ao alterar senha.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold text-ink-primary">Perfil</h1>

      <Card glow className="flex items-center gap-4 p-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-gradient text-[#04241C] shadow-glow">
          <User className="h-7 w-7" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-ink-primary">{profile?.full_name || 'Usuário'}</p>
          <p className="truncate text-sm text-ink-secondary">{user?.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={isAdmin ? 'brand' : 'neutral'}>
            <Shield className="h-3 w-3" />
            {isAdmin ? 'Administrador' : 'Usuário'}
          </Badge>
          <Badge tone="neutral">
            {(() => {
              const a = computeAccess(profile)
              if (!a) return '—'
              return { admin: 'Admin', lifetime: 'Vitalício', active: 'Assinante', expired: 'Expirado', blocked: 'Desativada' }[a.kind]
            })()}
          </Badge>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-secondary">Aparência</h2>
        <ThemeSettings />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-secondary">Notificações</h2>
        <NotificationSettings />
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-secondary">Dados pessoais</h2>
        <form onSubmit={handleProfileSubmit(onSaveProfile)} className="flex flex-col gap-4">
          <Input
            label="Nome completo"
            leftIcon={<User className="h-4 w-4" />}
            error={profileErrors.fullName?.message}
            {...registerProfile('fullName')}
          />
          <Button type="submit" loading={savingProfile} className="self-start">
            Salvar alterações
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-secondary">Alterar senha</h2>
        <form onSubmit={handlePasswordSubmit(onChangePassword)} className="flex flex-col gap-4">
          <Input
            label="Nova senha"
            type="password"
            placeholder="Mínimo 6 caracteres"
            leftIcon={<Lock className="h-4 w-4" />}
            error={passwordErrors.password?.message}
            {...registerPassword('password')}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            leftIcon={<Lock className="h-4 w-4" />}
            error={passwordErrors.confirmPassword?.message}
            {...registerPassword('confirmPassword')}
          />
          <Button type="submit" loading={isPasswordSubmitting} className="self-start">
            Alterar senha
          </Button>
        </form>
      </Card>

      <MyDataCard />

      <Button variant="secondary" onClick={signOut} className="w-full text-danger sm:w-fit">
        <LogOut className="h-4 w-4" />
        Sair da conta
      </Button>
    </div>
  )
}
