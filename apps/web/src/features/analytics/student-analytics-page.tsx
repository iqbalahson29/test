import { useQuery } from '@tanstack/react-query'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ClipboardCheck, Percent } from 'lucide-react'
import { analyticsApi } from './api'
import { StatTile } from './stat-tile'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const LINE_COLOR = '#0C66E4'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function StudentAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-analytics'],
    queryFn: analyticsApi.mine,
  })

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">My analytics</h1>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <StatTile
          label="Average score (graded)"
          value={data.averagePercent !== null ? `${data.averagePercent}%` : '—'}
          icon={Percent}
        />
        <StatTile label="Graded attempts" value={String(data.trend.length)} icon={ClipboardCheck} />
      </div>

      {data.trend.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Score trend</h2>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="submittedAt"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11 }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(label: unknown) => formatDate(String(label))}
                  formatter={(value: unknown) => `${value}%`}
                />
                <Line
                  type="monotone"
                  dataKey="percent"
                  stroke={LINE_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quiz</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.attempts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No attempts yet.
                </TableCell>
              </TableRow>
            )}
            {data.attempts.map((a) => (
              <TableRow key={a.attemptId}>
                <TableCell className="font-medium">{a.quizTitle}</TableCell>
                <TableCell className="text-muted-foreground">#{a.attemptNumber}</TableCell>
                <TableCell className="text-muted-foreground">{a.status}</TableCell>
                <TableCell className="text-muted-foreground">
                  {a.percent !== null ? `${a.percent}% (${a.score}/${a.maxScore})` : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
