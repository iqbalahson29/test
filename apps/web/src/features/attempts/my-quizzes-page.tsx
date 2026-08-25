import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, Eye, Play, RotateCcw } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { assignmentsApi } from '../assignments/api'
import type { MyAssignment, MyAssignmentStatus } from '../assignments/types'
import { attemptsApi } from './api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

const STATUS_STYLES: Record<MyAssignmentStatus, string> = {
  NOT_STARTED: 'bg-muted text-muted-foreground [&>svg]:text-muted-foreground/70',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 [&>svg]:text-blue-500',
  SUBMITTED: 'bg-amber-50 text-amber-700 [&>svg]:text-amber-500',
  GRADED: 'bg-emerald-50 text-emerald-700 [&>svg]:text-emerald-500',
}

const STATUS_LABELS: Record<MyAssignmentStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  GRADED: 'Graded',
}

function AttemptStatusBadge({ status }: { status: MyAssignmentStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 border-transparent font-medium', STATUS_STYLES[status])}
    >
      <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0">
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function canRetake(a: MyAssignment) {
  if (a.status === 'IN_PROGRESS' || a.status === 'NOT_STARTED') return false
  return a.maxAttempts == null || a.attemptsUsed < a.maxAttempts
}

export function MyQuizzesPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['assignments-mine'],
    queryFn: assignmentsApi.mine,
  })
  const [error, setError] = useState<string | null>(null)

  const startMutation = useMutation({
    mutationFn: (quizId: string) => attemptsApi.start(quizId),
    onSuccess: (attempt) => navigate(`/student/attempts/${attempt.id}`),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not start attempt'),
  })

  const onStartOrResume = (a: MyAssignment) => {
    setError(null)
    if (a.status === 'IN_PROGRESS' && a.latestAttemptId) {
      navigate(`/student/attempts/${a.latestAttemptId}`)
    } else {
      startMutation.mutate(a.quizId)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My quizzes</h1>
        <Button asChild variant="ghost">
          <Link to="/student/analytics">My analytics</Link>
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="mb-4 max-w-2xl">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {isLoading ? (
        <div className="max-w-2xl space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-2">
          {data?.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nothing assigned yet.</p>
              </CardContent>
            </Card>
          )}
          {data?.map((a) => (
            <Card key={a.assignmentId}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <p className="truncate font-medium">{a.quizTitle}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <AttemptStatusBadge status={a.status} />
                    {a.status === 'GRADED' && (
                      <span className="font-medium text-emerald-700">
                        {a.score}/{a.maxScore}
                      </span>
                    )}
                    {a.maxAttempts != null && (
                      <span>
                        {a.attemptsUsed}/{a.maxAttempts} attempts used
                      </span>
                    )}
                    {a.dueAt && <span>due {new Date(a.dueAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {(a.status === 'SUBMITTED' || a.status === 'GRADED') &&
                    a.latestAttemptId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate(`/student/attempts/${a.latestAttemptId}`)}
                      >
                        <Eye />
                        View
                      </Button>
                    )}
                  {(a.status === 'NOT_STARTED' ||
                    a.status === 'IN_PROGRESS' ||
                    canRetake(a)) && (
                    <Button
                      type="button"
                      onClick={() => onStartOrResume(a)}
                      disabled={startMutation.isPending}
                    >
                      {a.status === 'IN_PROGRESS' ? (
                        <>
                          <ArrowRight />
                          Resume
                        </>
                      ) : a.status === 'NOT_STARTED' ? (
                        <>
                          <Play />
                          Start
                        </>
                      ) : (
                        <>
                          <RotateCcw />
                          Retake
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
