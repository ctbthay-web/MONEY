import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '../ui/Card'
import { cn } from '../../lib/cn'

interface StatCardProps {
  label: string
  value: string
  icon: ReactNode
  tone?: 'brand' | 'positive' | 'danger' | 'neutral'
  hint?: string
  /** Variação percentual vs. o período de comparação anterior — omite a pílula se indisponível. */
  trend?: { percent: number; positiveIsGood: boolean } | null
}

const chipClasses = {
  brand: 'bg-brand-500/15 text-brand-300',
  positive: 'bg-positive/15 text-positive',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-white/5 text-ink-secondary',
}

const valueClasses = {
  brand: 'text-brand-300',
  positive: 'text-positive',
  danger: 'text-danger',
  neutral: 'text-ink-primary',
}

export function StatCard({ label, value, icon, tone = 'neutral', hint, trend }: StatCardProps) {
  const isGood = trend ? (trend.percent >= 0 ? trend.positiveIsGood : !trend.positiveIsGood) : true
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', chipClasses[tone])}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink-secondary">{label}</p>
          <p className={cn('font-display whitespace-nowrap text-base font-bold sm:text-lg', valueClasses[tone])}>{value}</p>
        </div>
        {trend && Number.isFinite(trend.percent) && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
              isGood ? 'border-positive/30 bg-positive/10 text-positive' : 'border-danger/30 bg-danger-soft text-danger'
            )}
          >
            {trend.percent >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {trend.percent >= 0 ? '+' : '-'}
            {Math.round(Math.abs(trend.percent))}%
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </Card>
  )
}
