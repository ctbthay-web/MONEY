import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  ArrowLeftRight,
  Tags,
  CreditCard,
  Target,
  PieChart,
  User,
  ShieldCheck,
  LogOut,
  Wallet,
  HandCoins,
  Crown,
  Telescope,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuth } from '../../features/auth/AuthProvider'

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Movimentações', icon: ArrowLeftRight },
  { to: '/categories', label: 'Categorias', icon: Tags },
  { to: '/accounts', label: 'Contas e cartões', icon: CreditCard },
  { to: '/reserves', label: 'Reservas e metas', icon: Target },
  { to: '/loans', label: 'Empréstimos', icon: HandCoins },
  { to: '/reports', label: 'Relatórios', icon: PieChart },
  { to: '/planning', label: 'Planejamento', icon: Telescope },
  { to: '/assistant', label: 'Assistente', icon: Sparkles },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all',
    isActive
      ? 'bg-brand-500/15 text-brand-200 shadow-[inset_0_0_0_1px_rgb(var(--a-300)/0.28)]'
      : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary'
  )

export function Sidebar() {
  const { isAdmin, profile, signOut } = useAuth()

  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-white/[0.06] px-4 py-6 backdrop-blur-xl md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-[#04241C] shadow-glow">
          <Wallet className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <span className="font-display text-lg font-bold tracking-tight text-ink-primary">Money</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/admin" className={navLinkClass}>
            <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} />
            Administração
          </NavLink>
        )}
      </nav>

      <div className="flex flex-col gap-1 border-t border-white/[0.06] pt-4">
        <NavLink to="/subscription" className={navLinkClass}>
          <Crown className="h-[18px] w-[18px]" strokeWidth={2} />
          Assinatura
        </NavLink>
        <NavLink to="/profile" className={navLinkClass}>
          <User className="h-[18px] w-[18px]" strokeWidth={2} />
          <span className="truncate">{profile?.full_name || 'Perfil'}</span>
        </NavLink>
        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
          Sair
        </button>
      </div>
    </aside>
  )
}
