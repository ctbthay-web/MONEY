import { moneyTone } from '../../lib/moneyTone'
import { MoreVertical } from 'lucide-react'
import { Card } from '../ui/Card'
import { resolveIcon } from '../../lib/icons'
import { formatCentsToBRL, formatPercent, safeRatio, formatDate } from '../../lib/format'
import type { Goal } from '../../types/database'

export function GoalCard({
  goal,
  onOptions,
  onClick,
}: {
  goal: Goal
  onOptions?: () => void
  onClick?: () => void
}) {
  const Icon = resolveIcon(goal.icon)
  const percent = Math.min(100, safeRatio(goal.accumulated_cents, goal.target_cents) * 100)
  const remaining = Math.max(0, goal.target_cents - goal.accumulated_cents)

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <button onClick={onClick} className="flex flex-1 items-center gap-3 text-left">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${goal.color}22`, color: goal.color }}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-primary">{goal.name}</p>
            {goal.deadline && <p className="text-xs text-ink-secondary">Meta: {formatDate(goal.deadline)}</p>}
          </div>
        </button>
        {onOptions && (
          <button
            onClick={onOptions}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-white/5 hover:text-ink-primary"
            aria-label="Opções"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-brand-gradient transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-brand-300">{formatPercent(percent)}</span>
          <span className="text-ink-muted">Faltam {formatCentsToBRL(remaining)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <p className={`text-lg font-bold ${moneyTone(goal.accumulated_cents)}`}>{formatCentsToBRL(goal.accumulated_cents)}</p>
        <p className="text-xs text-ink-secondary">de {formatCentsToBRL(goal.target_cents)}</p>
      </div>
    </Card>
  )
}
