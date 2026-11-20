import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="text-ink-muted">{icon}</div>}
      <div className="space-y-1">
        <p className="text-base font-semibold text-ink-primary">{title}</p>
        {description && <p className="max-w-xs text-sm text-ink-secondary">{description}</p>}
      </div>
      {action}
    </div>
  )
}
