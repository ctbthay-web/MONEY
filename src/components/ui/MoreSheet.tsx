import { NavLink } from 'react-router-dom'
import { Tags, CreditCard, User, ShieldCheck, LogOut, HandCoins, Crown, Telescope, Sparkles } from 'lucide-react'
import { Modal } from './Modal'
import { useAuth } from '../../features/auth/AuthProvider'
import { cn } from '../../lib/cn'

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAdmin, signOut } = useAuth()

  const links = [
    { to: '/categories', label: 'Categorias', icon: Tags },
    { to: '/accounts', label: 'Contas e cartões', icon: CreditCard },
    { to: '/planning', label: 'Planejamento', icon: Telescope },
    { to: '/assistant', label: 'Assistente', icon: Sparkles },
    { to: '/loans', label: 'Empréstimos', icon: HandCoins },
    { to: '/subscription', label: 'Assinatura', icon: Crown },
    { to: '/profile', label: 'Perfil', icon: User },
    ...(isAdmin ? [{ to: '/admin', label: 'Administração', icon: ShieldCheck }] : []),
  ]

  return (
    <Modal open={open} onClose={onClose} title="Mais opções">
      <div className="flex flex-col gap-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-500/15 text-brand-300' : 'text-ink-primary hover:bg-white/5'
              )
            }
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
        <button
          onClick={() => {
            onClose()
            signOut()
          }}
          className="mt-2 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
        >
          <LogOut className="h-5 w-5" strokeWidth={2} />
          Sair
        </button>
      </div>
    </Modal>
  )
}
