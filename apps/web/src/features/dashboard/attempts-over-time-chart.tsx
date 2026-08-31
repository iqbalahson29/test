import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AttemptsOverTimePoint } from './types'

const LINE_COLOR = '#0C66E4'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function AttemptsOverTimeChart({ data }: { data: AttemptsOverTimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: -20, right: 8 }}>
        <defs>
          <linearGradient id="attemptsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={LINE_COLOR} stopOpacity={0.25} />
            <stop offset="95%" stopColor={LINE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11 }}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip
          labelFormatter={(v) => formatDate(String(v))}
          formatter={(value) => [value, 'Attempts']}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={LINE_COLOR}
          fill="url(#attemptsFill)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
