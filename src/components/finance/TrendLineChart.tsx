import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCentsToBRL } from '../../lib/format'
import { CHART_AXIS, CHART_GRID, CHART_LINE, CHART_TEXT, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from '../../lib/chartColors'

interface TrendPoint {
  label: string
  valueCents: number
}

export function TrendLineChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART_AXIS, fontSize: 12 }}
          axisLine={{ stroke: CHART_GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_AXIS, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={0}
          hide
        />
        <Tooltip
          cursor={{ stroke: CHART_GRID, strokeWidth: 1 }}
          formatter={(value) => [formatCentsToBRL(Number(value)), 'Saldo']}
          contentStyle={{
            background: CHART_TOOLTIP_BG,
            border: CHART_TOOLTIP_BORDER,
            borderRadius: 16,
            color: 'var(--chart-tooltip-text)',
            fontSize: 13,
          }}
          labelStyle={{ color: CHART_TEXT }}
        />
        <Line
          type="monotone"
          dataKey="valueCents"
          stroke={CHART_LINE}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_LINE, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
