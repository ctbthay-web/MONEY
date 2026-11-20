import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-300/20 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-violet-400/15 blur-[110px]"
        aria-hidden
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-gradient text-[#04241C] shadow-glow">
            <Wallet className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary">{title}</h1>
            <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
          </div>
        </div>
        <div className="glass glow-ring rounded-4xl p-6 shadow-soft sm:p-8">{children}</div>
        <p className="mt-5 text-center text-xs text-ink-muted">
          <Link to="/termos" className="hover:text-ink-secondary">Termos de Uso</Link> ·{' '}
          <Link to="/privacidade" className="hover:text-ink-secondary">Política de Privacidade</Link>
        </p>
      </div>
    </div>
  )
}
