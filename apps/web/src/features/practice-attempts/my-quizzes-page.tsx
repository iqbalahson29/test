import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, Eye, Play, RotateCcw } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { practiceAssignmentsApi } from '../practice-assignments/api'
import type { MyAssignment } from '../practice-assignments/types'
import { type Bucket, BUCKET_ORDER, bucketOf, groupByBucket } from '../practice-assignments/bucket'
import { practiceAnalyticsApi } from '../practice-analytics/api'
import { practiceAttemptsApi } from './api'
import { AttemptStatusBadge } from './status-badge'
import { UpcomingCalendar } from './upcoming-calendar'
import { RecentActivity } from './recent-activity'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Pagination } from '@/components/ui/pagination'

const PAGE_SIZE = 8

type TabKey = 'all' | Bucket

const TAB_ORDER: TabKey[] = ['all', ...BUCKET_ORDER]

const TAB_LABELS: Record<TabKey, string> = {
  all: 'All quizzes',
  overdue: 'Overdue',
  inProgress: 'In progress',
  dueSoon: 'Due soon',
  upcoming: 'Upcoming',
  completed: 'Completed',
}

function canRetake(a: MyAssignment) {
  if (a.status === 'IN_PROGRESS' || a.status === 'NOT_STARTED') return false
  return a.maxAttempts == null || a.attemptsUsed < a.maxAttempts
}

function assignmentCardId(assignmentId: string) {
  return `assignment-${assignmentId}`
}

export function MyPracticeQuizzesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data, isLoading } = useQuery({
    queryKey: ['practice-assignments-mine'],
    queryFn: practiceAssignmentsApi.mine,
  })
  const { data: analytics } = useQuery({
    queryKey: ['my-practice-analytics'],
    queryFn: practiceAnalyticsApi.mine,
  })
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [page, setPage] = useState(1)

  const startMutation = useMutation({
    mutationFn: (quizId: string) => practiceAttemptsApi.start(quizId),
    onSuccess: (attempt) => navigate(`/student/practice-attempts/${attempt.id}`),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not start attempt'),
  })

  const onStartOrResume = (a: MyAssignment) => {
    setError(null)
    if (a.status === 'IN_PROGRESS' && a.latestAttemptId) {
      navigate(`/student/practice-attempts/${a.latestAttemptId}`)
    } else {
      startMutation.mutate(a.quizId)
    }
  }

  const now = useMemo(() => Date.now(), [])

  const grouped = useMemo(() => groupByBucket(data ?? [], now), [data, now])

  const onJump = (assignmentId: string) => {
    const target = data?.find((a) => a.assignmentId === assignmentId)
    if (!target) return
    const bucket = bucketOf(target, now)
    const indexInBucket = grouped[bucket].findIndex((a) => a.assignmentId === assignmentId)
    setActiveTab(bucket)
    setPage(Math.floor(indexInBucket / PAGE_SIZE) + 1)
    window.setTimeout(() => {
      const el = document.getElementById(assignmentCardId(assignmentId))
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary')
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1500)
    }, 50)
  }

  useEffect(() => {
    const jumpTo = (location.state as { jumpTo?: string } | null)?.jumpTo
    if (jumpTo && data) {
      onJump(jumpTo)
      navigate(location.pathname, { replace: true, state: null })
    }
    // Only re-run once the assignment list has loaded — location.state is
    // consumed exactly once via the replace() above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const activeItems = useMemo(
    () => (activeTab === 'all' ? BUCKET_ORDER.flatMap((b) => grouped[b]) : grouped[activeTab]),
    [activeTab, grouped],
  )

  const totalPages = Math.max(1, Math.ceil(activeItems.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = activeItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const onTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-gray-900">My practice quizzes</h1>
          <Button asChild variant="ghost">
            <Link to="/student/practice-analytics">My analytics</Link>
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : data?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <ClipboardList className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nothing assigned yet.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-5 border-b border-gray-200">
              {TAB_ORDER.map((tab) => {
                const count = tab === 'all' ? data?.length ?? 0 : grouped[tab].length
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => onTabChange(tab)}
                    className={cn(
                      '-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                      tab === activeTab
                        ? 'border-primary-600 text-gray-900'
                        : 'border-transparent text-gray-400 hover:text-gray-600',
                    )}
                  >
                    {TAB_LABELS[tab]}
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        tab === activeTab ? 'text-primary-600' : 'text-gray-300',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {activeItems.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <ClipboardList className="size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Nothing in {TAB_LABELS[activeTab].toLowerCase()}.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pageItems.map((a) => {
                  const bucket = bucketOf(a, now)
                  return (
                    <Card
                      key={a.assignmentId}
                      id={assignmentCardId(a.assignmentId)}
                      className={cn(
                        'transition-shadow',
                        bucket === 'overdue' && 'border-destructive/30',
                      )}
                    >
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
                            {a.dueAt && (
                              <span
                                className={cn(bucket === 'overdue' && 'font-medium text-destructive')}
                              >
                                due {new Date(a.dueAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {(a.status === 'SUBMITTED' || a.status === 'GRADED') &&
                            a.latestAttemptId && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate(`/student/practice-attempts/${a.latestAttemptId}`)}
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
                  )
                })}
              </div>
            )}

            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              className="justify-center pt-1"
            />
          </>
        )}
      </div>

      <aside className="w-full space-y-4 xl:w-72 xl:shrink-0">
        <UpcomingCalendar assignments={data ?? []} onJump={onJump} />
        <RecentActivity attempts={analytics?.attempts ?? []} />
      </aside>
    </div>
  )
}
