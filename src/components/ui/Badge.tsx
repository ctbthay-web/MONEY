import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Tone = 'brand' | 'danger' | 'neutral' | 'warning'

const toneClasses: Record<Tone, string> = {
  brand: 'bg-brand-500/15 text-brand-300 border-brand-500/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  neutral: 'bg-white/5 text-ink-secondary border-border',
  warning: 'bg-warning/10 text-warning border-warning/25',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
