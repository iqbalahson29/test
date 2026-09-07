import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Award, CheckCircle2, Percent, Target } from 'lucide-react'
import { QUIZ_MODULE_SEQUENCE, QUIZ_MODULE_LABELS, QUIZ_MODULE_SHORT_LABELS } from '@quiz-platform/shared'
import type { QuestionDifficulty, QuizModule } from '@quiz-platform/shared'
import { practiceAnalyticsApi } from './api'
import { StatTile } from './stat-tile'
import { DIFFICULTY_LABELS } from '@/components/difficulty-badge'
import { ExportMenu } from '@/components/export-menu'
import { exportSectionsToPdf, exportSheetsToExcel } from '@/lib/export'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const BAR_COLOR = '#0C66E4'

const DIFFICULTY_COLORS: Record<QuestionDifficulty, string> = {
  EASY: '#10b981',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
}
const NO_DIFFICULTY_COLOR = '#cbd5e1'

const MODULE_COLORS: Record<QuizModule, string> = {
  RW_MODULE_1: '#0C66E4',
  RW_MODULE_2: '#3b82f6',
  MATH_MODULE_1: '#7c3aed',
  MATH_MODULE_2: '#a855f7',
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function PracticeQuizAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['practice-quiz-analytics', id],
    queryFn: () => practiceAnalyticsApi.forQuiz(id!),
    enabled: !!id,
  })

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  // A BANK-mode quiz has no perQuestion/byDifficulty/byModule/maxScore —
  // each attempt drew a different random question set (and can have a
  // different maxScore), so those breakdowns and a single quiz-wide
  // maxScore don't mean anything here. Aggregate stats only.
  const isBankMode = data.perQuestion === undefined

  const perQuestionSorted = (data.perQuestion ?? []).slice().sort((a, b) => {
    if (a.percentCorrect === null) return 1
    if (b.percentCorrect === null) return -1
    return a.percentCorrect - b.percentCorrect
  })

  const summaryColumns = ['Metric', 'Value']
  const summaryRows = [
    ['Total attempts', data.totalAttempts],
    ['Graded attempts', data.gradedAttempts],
    ['Average score', data.averagePercent !== null ? `${data.averagePercent}%` : '—'],
    ['Median score', data.medianPercent !== null ? `${data.medianPercent}%` : '—'],
    ['Pass rate', data.passRate !== null ? `${data.passRate}%` : 'No pass mark'],
    [
      'Average points',
      data.averageScore === null
        ? '—'
        : isBankMode
          ? String(data.averageScore)
          : `${data.averageScore}/${data.maxScore}`,
    ],
  ]
  const distributionColumns = ['Score bucket', 'Attempts']
  const distributionRows = data.scoreDistribution.map((b) => [b.bucket, b.count])
  const perQuestionColumns = ['#', 'Prompt', 'Type', 'Difficulty', 'Points', '% correct', 'Average %']
  const perQuestionRows = perQuestionSorted.map((q, i) => [
    i + 1,
    q.prompt,
    q.type,
    q.difficulty ? DIFFICULTY_LABELS[q.difficulty] : '',
    q.points,
    q.percentCorrect !== null ? `${q.percentCorrect}%` : '—',
    q.averagePercent !== null ? `${q.averagePercent}%` : '—',
  ])
  const byDifficultyColumns = ['Difficulty', 'Questions', 'Average %']
  const byDifficultyRows = (data.byDifficulty ?? []).map((d) => [
    DIFFICULTY_LABELS[d.difficulty],
    d.questionCount,
    d.averagePercent !== null ? `${d.averagePercent}%` : '—',
  ])
  const hasDifficultyData = (data.byDifficulty ?? []).some((d) => d.questionCount > 0)
  const byModuleColumns = ['Module', 'Questions', 'Average %']
  const byModuleRows = (data.byModule ?? []).map((m) => [
    QUIZ_MODULE_LABELS[m.module],
    m.questionCount,
    m.averagePercent !== null ? `${m.averagePercent}%` : '—',
  ])
  const hasModuleData = (data.byModule ?? []).some((m) => m.questionCount > 0)

  const onExportPdf = () =>
    exportSectionsToPdf(`${data.quizTitle} - analytics`, `Analytics — ${data.quizTitle}`, [
      { heading: 'Summary', columns: summaryColumns, rows: summaryRows },
      { heading: 'Score distribution', columns: distributionColumns, rows: distributionRows },
      ...(isBankMode
        ? []
        : [{ heading: 'Per-question accuracy', columns: perQuestionColumns, rows: perQuestionRows }]),
      ...(hasDifficultyData
        ? [{ heading: 'By difficulty', columns: byDifficultyColumns, rows: byDifficultyRows }]
        : []),
      ...(hasModuleData
        ? [{ heading: 'By module', columns: byModuleColumns, rows: byModuleRows }]
        : []),
    ])

  const onExportExcel = () =>
    exportSheetsToExcel(`${data.quizTitle} - analytics`, [
      { name: 'Summary', columns: summaryColumns, rows: summaryRows },
      { name: 'Score distribution', columns: distributionColumns, rows: distributionRows },
      ...(isBankMode
        ? []
        : [{ name: 'Per question', columns: perQuestionColumns, rows: perQuestionRows }]),
      ...(hasDifficultyData
        ? [{ name: 'By difficulty', columns: byDifficultyColumns, rows: byDifficultyRows }]
        : []),
      ...(hasModuleData ? [{ name: 'By module', columns: byModuleColumns, rows: byModuleRows }] : []),
    ])

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[17px] font-bold text-gray-900">Analytics — {data.quizTitle}</h1>
        <ExportMenu onExportPdf={onExportPdf} onExportExcel={onExportExcel} />
      </div>
      <p className="mb-6 text-[12px] text-gray-400">
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
            data.averageScore === null
              ? '—'
              : isBankMode
                ? String(data.averageScore)
                : `${data.averageScore}/${data.maxScore}`
          }
          icon={Award}
        />
      </div>

      {isBankMode && (
        <p className="mb-4 text-[12px] text-muted-foreground">
          This is a question-bank quiz — each attempt drew its own random question set, so
          per-question, per-module, and per-difficulty breakdowns aren't shown here. Open an
          individual attempt from the Results tab to see exactly what that student was asked.
        </p>
      )}

      {data.gradedAttempts === 0 ? (
        <p className="text-sm text-muted-foreground">No graded attempts yet.</p>
      ) : (
        <div className="space-y-6">
          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-[12.5px] font-bold text-gray-800">Score distribution</h2>
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

          {!isBankMode && (
          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-[12.5px] font-bold text-gray-800">Per-question accuracy (hardest first)</h2>
              <p className="text-[11.5px] text-gray-400">
                Bar color shows each question's difficulty level, where set.
              </p>
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
                  <Tooltip
                    formatter={(value: unknown, _name, item) => [
                      `${value}%`,
                      item?.payload?.difficulty
                        ? `Accuracy · ${DIFFICULTY_LABELS[item.payload.difficulty as QuestionDifficulty]}`
                        : 'Accuracy',
                    ]}
                  />
                  <Bar dataKey="percentCorrect" radius={[0, 4, 4, 0]}>
                    {perQuestionSorted.map((q) => (
                      <Cell
                        key={q.questionId}
                        fill={q.difficulty ? DIFFICULTY_COLORS[q.difficulty] : BAR_COLOR}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          )}

          {!isBankMode && hasModuleData && (
            <Card className="rounded-md">
              <CardHeader>
                <h2 className="text-[12.5px] font-bold text-gray-800">Average score by module</h2>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={QUIZ_MODULE_SEQUENCE.map((m) => data.byModule!.find((d) => d.module === m)!)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="module"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: QuizModule) => QUIZ_MODULE_SHORT_LABELS[v]}
                    />
                    <YAxis domain={[0, 100]} allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: unknown, _name, item) => [
                        value !== null ? `${value}%` : 'No graded questions yet',
                        `${item?.payload?.questionCount ?? 0} question${item?.payload?.questionCount === 1 ? '' : 's'}`,
                      ]}
                      labelFormatter={(v) => QUIZ_MODULE_LABELS[v as QuizModule]}
                    />
                    <Bar dataKey="averagePercent" radius={[4, 4, 0, 0]}>
                      {data.byModule!.map((m) => (
                        <Cell
                          key={m.module}
                          fill={m.questionCount > 0 ? MODULE_COLORS[m.module] : NO_DIFFICULTY_COLOR}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {!isBankMode && hasDifficultyData && (
            <Card className="rounded-md">
              <CardHeader>
                <h2 className="text-[12.5px] font-bold text-gray-800">Average score by difficulty</h2>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.byDifficulty!}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="difficulty"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: QuestionDifficulty) => DIFFICULTY_LABELS[v]}
                    />
                    <YAxis domain={[0, 100]} allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: unknown, _name, item) => [
                        value !== null ? `${value}%` : 'No graded questions yet',
                        `${item?.payload?.questionCount ?? 0} question${item?.payload?.questionCount === 1 ? '' : 's'}`,
                      ]}
                      labelFormatter={(v) => DIFFICULTY_LABELS[v as QuestionDifficulty]}
                    />
                    <Bar dataKey="averagePercent" radius={[4, 4, 0, 0]}>
                      {data.byDifficulty!.map((d) => (
                        <Cell
                          key={d.difficulty}
                          fill={d.questionCount > 0 ? DIFFICULTY_COLORS[d.difficulty] : NO_DIFFICULTY_COLOR}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
