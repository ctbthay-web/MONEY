import type { ReactNode } from 'react'
import { Card } from '../ui/Card'

export function ChartCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  )
}
