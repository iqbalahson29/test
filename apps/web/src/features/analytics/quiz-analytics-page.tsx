import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Award, CheckCircle2, Percent, Target } from 'lucide-react'
import { analyticsApi } from './api'
import { StatTile } from './stat-tile'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const BAR_COLOR = '#0C66E4'

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function QuizAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['quiz-analytics', id],
    queryFn: () => analyticsApi.forQuiz(id!),
    enabled: !!id,
  })

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const perQuestionSorted = [...data.perQuestion].sort((a, b) => {
    if (a.percentCorrect === null) return 1
    if (b.percentCorrect === null) return -1
    return a.percentCorrect - b.percentCorrect
  })

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics — {data.quizTitle}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {data.gradedAttempts} graded of {data.totalAttempts} total attempt
        {data.totalAttempts === 1 ? '' : 's'}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Average score"
          value={data.averagePercent !== null ? `${data.averagePercent}%` : '—'}
          icon={Percent}
        />
        <StatTile
          label="Median score"
          value={data.medianPercent !== null ? `${data.medianPercent}%` : '—'}
          icon={Target}
        />
        <StatTile
          label="Pass rate"
          value={data.passRate !== null ? `${data.passRate}%` : 'No pass mark'}
          icon={CheckCircle2}
        />
        <StatTile
          label="Average points"
          value={
            data.averageScore !== null ? `${data.averageScore}/${data.maxScore}` : '—'
          }
          icon={Award}
        />
      </div>

      {data.gradedAttempts === 0 ? (
        <p className="text-sm text-muted-foreground">No graded attempts yet.</p>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Score distribution</h2>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Question difficulty (hardest first)</h2>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer
                width="100%"
                height={Math.max(120, perQuestionSorted.length * 40)}
              >
                <BarChart data={perQuestionSorted} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="prompt"
                    tick={{ fontSize: 11 }}
                    width={160}
                    tickFormatter={(v: string) => truncate(v, 22)}
                  />
                  <Tooltip formatter={(value: unknown) => `${value}%`} />
                  <Bar dataKey="percentCorrect" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
