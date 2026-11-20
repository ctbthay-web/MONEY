import { Sparkles } from 'lucide-react'
import type { Insight } from '../../lib/insights'
import { cn } from '../../lib/cn'

const toneDot: Record<Insight['tone'], string> = {
  brand: 'bg-brand-300',
  danger: 'bg-danger',
  neutral: 'bg-violet-400',
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        <Sparkles className="h-3.5 w-3.5 text-brand-300" />
        O que a Money notou
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="glass flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm text-ink-primary"
          >
            <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', toneDot[insight.tone])} />
            <span className="leading-snug">{insight.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
