import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { AttemptStatusBadge } from '../../attempts/status-badge'
import { quizzesApi } from '../api'
import { AttemptDetailDialog } from './attempt-detail-dialog'
import { formatDateTime } from './format'
import { ExportMenu } from '@/components/export-menu'
import { exportSectionsToPdf, exportSheetsToExcel } from '@/lib/export'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const RESULTS_COLUMNS = [
  'Student',
  'Email',
  'Attempt #',
  'Status',
  'Score',
  'Max score',
  'Percent',
  'Started',
  'Submitted',
]

export function QuizResultsTab({ quizId, quizTitle }: { quizId: string; quizTitle: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['quiz-results', quizId],
    queryFn: () => quizzesApi.results(quizId),
  })
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const resultRows = data.map((r) => [
    r.studentName,
    r.studentEmail,
    r.attemptNumber,
    r.status,
    r.score ?? '—',
    r.maxScore ?? '—',
    r.percent !== null ? `${r.percent}%` : '—',
    formatDateTime(r.startedAt),
    r.submittedAt ? formatDateTime(r.submittedAt) : '—',
  ])

  const onExportPdf = () =>
    exportSectionsToPdf(`${quizTitle} - results`, `Results — ${quizTitle}`, [
      { columns: RESULTS_COLUMNS, rows: resultRows },
    ])

  const onExportExcel = () =>
    exportSheetsToExcel(`${quizTitle} - results`, [
      { name: 'Results', columns: RESULTS_COLUMNS, rows: resultRows },
    ])

  if (data.length === 0) {
    return (
      <Card className="rounded-md">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ClipboardList className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No attempts yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          Click a row to view a student's answers and override any question's score.
        </p>
        <ExportMenu onExportPdf={onExportPdf} onExportExcel={onExportExcel} />
      </div>
      <Table containerClassName="rounded-md">
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Attempt</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Submitted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow
              key={r.attemptId}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => setOpenAttemptId(r.attemptId)}
            >
              <TableCell>
                <p className="font-medium text-gray-800">{r.studentName}</p>
                <p className="text-[11px] text-gray-400">{r.studentEmail}</p>
              </TableCell>
              <TableCell>#{r.attemptNumber}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <AttemptStatusBadge status={r.status} />
                  {r.status === 'IN_PROGRESS' && r.sessionActive && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                      Active
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {r.score !== null && r.maxScore !== null
                  ? `${r.score}/${r.maxScore}${r.percent !== null ? ` (${r.percent}%)` : ''}`
                  : '—'}
              </TableCell>
              <TableCell>{formatDateTime(r.startedAt)}</TableCell>
              <TableCell>{r.submittedAt ? formatDateTime(r.submittedAt) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AttemptDetailDialog
        quizId={quizId}
        attemptId={openAttemptId}
        onOpenChange={(open) => !open && setOpenAttemptId(null)}
      />
    </>
  )
}
