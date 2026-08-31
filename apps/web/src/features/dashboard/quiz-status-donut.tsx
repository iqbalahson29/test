import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { QuizStatusCount } from './types'

const COLORS: Record<string, string> = {
  PUBLISHED: '#10b981',
  SCHEDULED: '#0ea5e9',
  DRAFT: '#94a3b8',
  ARCHIVED: '#f59e0b',
}

const LABELS: Record<string, string> = {
  PUBLISHED: 'Published',
  SCHEDULED: 'Scheduled',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
}

export function QuizStatusDonut({ data }: { data: QuizStatusCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative size-[120px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={38}
              outerRadius={56}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.status} fill={COLORS[d.status]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-900">{total}</span>
          <span className="text-[10px] text-muted-foreground">Total quizzes</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-2">
        {data.map((d) => (
          <li key={d.status} className="flex items-center justify-between gap-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-gray-600">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[d.status] }}
              />
              <span className="truncate">{LABELS[d.status]}</span>
            </span>
            <span className="shrink-0 font-medium text-gray-800">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
