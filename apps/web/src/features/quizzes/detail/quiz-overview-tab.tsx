import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  Award,
  BarChart3,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Paperclip,
  Plus,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import { assignmentsApi } from '../../assignments/api'
import { quizzesApi } from '../api'
import type { QuestionDetail } from '../types'
import { formatDate, formatDateTime, formatDuration, initials, quizCode } from './format'
import { QuestionDetailDialog } from './question-detail-dialog'
import { QuestionRowMenu } from './question-row-menu'
import type { useQuizQuickActions } from './use-quiz-quick-actions'
import type { QuizTabKey } from './tab-key'
import type { QuizDetail } from '../types'
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PREVIEW_COUNT = 4
const AVATAR_LIMIT = 3

export function QuizOverviewTab({
  quiz,
  quickActions,
  onTabChange,
  onEditQuestion,
  onAddQuestion,
  onDeleteQuizClick,
}: {
  quiz: QuizDetail
  quickActions: ReturnType<typeof useQuizQuickActions>
  onTabChange: (tab: QuizTabKey) => void
  onEditQuestion: (q: QuestionDetail) => void
  onAddQuestion: () => void
  onDeleteQuizClick: () => void
}) {
  const [viewing, setViewing] = useState<QuestionDetail | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

  const { data: summary } = useQuery({
    queryKey: ['assignment-summary', quiz.id],
    queryFn: () => assignmentsApi.summary(quiz.id),
  })
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['quiz-activity', quiz.id],
    queryFn: () => quizzesApi.activity(quiz.id),
  })

  const totalPoints = quiz.questions.reduce((sum, q) => sum + Number(q.points), 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <Card className="rounded-md">
          <button
            type="button"
            onClick={() => setStatsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 text-left"
          >
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="text-[12.5px] font-bold text-gray-800">Overview</span>
              {!statsOpen && (
                <span className="truncate text-xs text-muted-foreground">
                  {quiz.attemptCount} attempts ·{' '}
                  {quiz.averageScorePercent !== null ? `${quiz.averageScorePercent}%` : '—'} avg
                  score · {summary ? summary.assignedStudents.length : '…'} assigned ·{' '}
                  {formatDuration(quiz.timeLimitSec)} duration
                </span>
              )}
            </div>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${statsOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {statsOpen && (
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className="rounded-md">
                  <CardContent className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Total attempts</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">
                        {quiz.attemptCount}
                      </p>
                      <p className="mt-1 text-[12px] text-gray-400">Across all students</p>
                    </div>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BarChart3 className="size-4" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-md">
                  <CardContent className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Average score</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">
                        {quiz.averageScorePercent !== null
                          ? `${quiz.averageScorePercent}%`
                          : '—'}
                      </p>
                      <p className="mt-1 text-[12px] text-gray-400">Across all attempts</p>
                    </div>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Award className="size-4" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-md">
                  <CardContent className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Assigned to</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">
                        {summary ? summary.assignedStudents.length : '…'}
                      </p>
                      <p className="mt-1 text-[12px] text-gray-400">Students</p>
                    </div>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="size-4" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-md">
                  <CardContent className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Duration</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">
                        {formatDuration(quiz.timeLimitSec)}
                      </p>
                      <p className="mt-1 text-[12px] text-gray-400">
                        {quiz.timeLimitSec ? 'Time limit' : 'No time limit set'}
                      </p>
                    </div>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Clock className="size-4" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="rounded-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Assignment</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {!summary
                  ? 'Loading…'
                  : summary.assignedStudents.length === 0
                    ? 'This quiz is not assigned to anyone yet.'
                    : 'This quiz is assigned to specific student(s).'}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onTabChange('assign')}>
              <UserRound />
              Manage assignments
            </Button>
          </CardHeader>
          {summary && summary.assignedStudents.length > 0 && (
            <CardContent>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="mb-1.5 text-[12px] text-gray-400">
                    Assigned students ({summary.assignedStudents.length})
                  </p>
                  <AvatarGroup>
                    {summary.assignedStudents.slice(0, AVATAR_LIMIT).map((s) => (
                      <Avatar key={s.id} className="rounded-md">
                        <AvatarImage src={s.avatarUrl ?? undefined} alt="" className="rounded-md" />
                        <AvatarFallback className="rounded-md">{initials(s.name)}</AvatarFallback>
                      </Avatar>
                    ))}
                    {summary.assignedStudents.length > AVATAR_LIMIT && (
                      <AvatarGroupCount className="rounded-md">
                        +{summary.assignedStudents.length - AVATAR_LIMIT}
                      </AvatarGroupCount>
                    )}
                  </AvatarGroup>
                </div>
                <div>
                  <p className="mb-1.5 text-[12px] text-gray-400">Due date</p>
                  <p className="text-sm font-medium text-gray-800">
                    {summary.nearestDueAt ? formatDateTime(summary.nearestDueAt) : 'No due date'}
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="rounded-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Questions preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quiz.questions.length === 0 && (
              <p className="text-sm text-muted-foreground">No questions yet.</p>
            )}
            {quiz.questions.slice(0, PREVIEW_COUNT).map((q, i) => (
              <div
                key={q.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{q.type}</Badge>
                    <span className="text-[12px] text-muted-foreground">{q.points} pts</span>
                    {q.attachmentKey && (
                      <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Paperclip className="size-3" />
                        {q.attachmentFilename}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm">{q.prompt}</p>
                </div>
                <QuestionRowMenu
                  question={q}
                  editable
                  onView={() => setViewing(q)}
                  onEdit={() => onEditQuestion(q)}
                />
              </div>
            ))}
            {quiz.questions.length > PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => onTabChange('questions')}
                className="w-full text-center text-[12.5px] text-muted-foreground hover:text-foreground"
              >
                + {quiz.questions.length - PREVIEW_COUNT} more question
                {quiz.questions.length - PREVIEW_COUNT === 1 ? '' : 's'}
              </button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-center border border-dashed"
              onClick={onAddQuestion}
            >
              <Plus />
              Add question
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="rounded-md">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <button
              type="button"
              onClick={() => quickActions.duplicate.mutate()}
              disabled={quickActions.duplicate.isPending}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-muted disabled:opacity-50"
            >
              <Copy className="size-4 text-muted-foreground" />
              {quickActions.duplicate.isPending ? 'Duplicating…' : 'Duplicate quiz'}
            </button>
            <button
              type="button"
              onClick={quickActions.exportPdf}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-muted"
            >
              <Download className="size-4 text-muted-foreground" />
              Export quiz
            </button>
            {quickActions.canRestore ? (
              <button
                type="button"
                onClick={() => quickActions.restore.mutate()}
                disabled={quickActions.restore.isPending}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-muted disabled:opacity-50"
              >
                <ArchiveRestore className="size-4 text-muted-foreground" />
                {quickActions.restore.isPending ? 'Restoring…' : 'Restore quiz'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => quickActions.archive.mutate()}
                disabled={!quickActions.canArchive || quickActions.archive.isPending}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-muted disabled:opacity-50"
                title={!quickActions.canArchive ? 'Only published or scheduled quizzes can be archived' : undefined}
              >
                <Archive className="size-4 text-muted-foreground" />
                {quickActions.archive.isPending ? 'Archiving…' : 'Archive quiz'}
              </button>
            )}
            <button
              type="button"
              onClick={onDeleteQuizClick}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Delete quiz
            </button>
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle>Quiz information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {[
              ['Quiz ID', quizCode(quiz.id)],
              ['Created by', quiz.createdByName],
              ['Created on', formatDate(quiz.createdAt)],
              ['Last updated', formatDate(quiz.updatedAt)],
              ['Total questions', String(quiz.questions.length)],
              ['Total points', String(totalPoints)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-gray-800">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Activity log</CardTitle>
            {activity && activity.length > 3 && (
              <button
                type="button"
                onClick={() => setActivityOpen(true)}
                className="text-[12.5px] font-medium text-primary hover:underline"
              >
                View all
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {activityLoading && <Skeleton className="h-16 w-full" />}
            {activity?.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {activity?.slice(0, 3).map((a) => (
              <div key={a.id}>
                <p className="text-[13px] text-gray-800">{a.message}</p>
                <p className="text-[11px] text-gray-400">{formatDateTime(a.createdAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <QuestionDetailDialog
        quizId={quiz.id}
        question={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Activity log</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {activity?.map((a) => (
              <div key={a.id}>
                <p className="text-[13px] text-gray-800">{a.message}</p>
                <p className="text-[11px] text-gray-400">{formatDateTime(a.createdAt)}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
