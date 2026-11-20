import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCentsToBRL } from '../../lib/format'
import {
  CHART_AXIS,
  CHART_EXPENSE,
  CHART_GRID,
  CHART_INCOME,
  CHART_TEXT,
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
} from '../../lib/chartColors'

interface BarPoint {
  label: string
  incomeCents: number
  expenseCents: number
}

export function IncomeExpenseBarChart({ data }: { data: BarPoint[] }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_AXIS, fontSize: 12 }}
            axisLine={{ stroke: CHART_GRID }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'var(--c-surface-light)' }}
            formatter={(value, key) => [
              formatCentsToBRL(Number(value)),
              key === 'incomeCents' ? 'Receitas' : 'Despesas',
            ]}
            contentStyle={{
              background: CHART_TOOLTIP_BG,
              border: CHART_TOOLTIP_BORDER,
              borderRadius: 16,
              color: 'var(--chart-tooltip-text)',
              fontSize: 13,
            }}
            labelStyle={{ color: CHART_TEXT }}
          />
          <Bar dataKey="incomeCents" fill={CHART_INCOME} radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenseCents" fill={CHART_EXPENSE} radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex items-center justify-center gap-5 text-xs text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_INCOME }} />
          Receitas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_EXPENSE }} />
          Despesas
        </span>
      </div>
    </div>
  )
}
