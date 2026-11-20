import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutGrid, ArrowLeftRight, Target, PieChart, Menu } from 'lucide-react'
import { cn } from '../../lib/cn'
import { MoreSheet } from './MoreSheet'

const items = [
  { to: '/', label: 'Início', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Movimentos', icon: ArrowLeftRight },
  { to: '/reserves', label: 'Reservas', icon: Target },
  { to: '/reports', label: 'Relatórios', icon: PieChart },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:hidden"
        aria-label="Navegação principal"
      >
        <div className="glass solid-surface flex w-full max-w-md items-center justify-between gap-1 rounded-3xl px-2 py-2 shadow-soft">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition-colors',
                  isActive ? 'bg-brand-500/15 text-brand-300' : 'text-ink-muted hover:text-ink-secondary'
                )
              }
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink-secondary"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
            Mais
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}
