import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCentsToBRL, formatPercent, safeRatio } from '../../lib/format'
import { CHART_CATEGORICAL, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from '../../lib/chartColors'
import { resolveIcon } from '../../lib/icons'

export interface CategorySlice {
  name: string
  icon: string
  valueCents: number
}

const MAX_SLICES = 7

export function CategoryDonutChart({ data }: { data: CategorySlice[] }) {
  const sorted = [...data].sort((a, b) => b.valueCents - a.valueCents)
  const top = sorted.slice(0, MAX_SLICES)
  const rest = sorted.slice(MAX_SLICES)
  const restTotal = rest.reduce((sum, s) => sum + s.valueCents, 0)
  const slices = restTotal > 0 ? [...top, { name: 'Outras', icon: 'more-horizontal', valueCents: restTotal }] : top
  const total = slices.reduce((sum, s) => sum + s.valueCents, 0)

  if (total === 0) return null

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <ResponsiveContainer width={180} height={180} className="shrink-0">
        <PieChart>
          <Pie
            data={slices}
            dataKey="valueCents"
            nameKey="name"
            innerRadius={54}
            outerRadius={80}
            paddingAngle={2}
            stroke={CHART_TOOLTIP_BG}
            strokeWidth={2}
          >
            {slices.map((slice, i) => (
              <Cell key={slice.name} fill={CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, entry) => {
              const numeric = Number(value)
              return [
                `${formatCentsToBRL(numeric)} (${formatPercent(safeRatio(numeric, total) * 100)})`,
                (entry?.payload as { name?: string } | undefined)?.name ?? '',
              ]
            }}
            contentStyle={{
              background: CHART_TOOLTIP_BG,
              border: CHART_TOOLTIP_BORDER,
              borderRadius: 16,
              color: 'var(--chart-tooltip-text)',
              fontSize: 13,
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex w-full min-w-0 flex-col gap-2">
        {slices.map((slice, i) => {
          const Icon = resolveIcon(slice.icon)
          const percent = safeRatio(slice.valueCents, total) * 100
          return (
            <div key={slice.name} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHART_CATEGORICAL[i % CHART_CATEGORICAL.length] }}
              />
              <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-ink-secondary">{slice.name}</span>
              <span className="shrink-0 font-semibold text-ink-primary">{formatPercent(percent)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
