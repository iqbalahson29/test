import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  HelpCircle,
  Percent,
  Plus,
  Users,
} from 'lucide-react'
import { dashboardApi } from '../features/dashboard/api'
import type { DashboardRange } from '../features/dashboard/types'
import { AdminQuizCalendar } from '../features/dashboard/admin-quiz-calendar'
import { AttemptsOverTimeChart } from '../features/dashboard/attempts-over-time-chart'
import { QuizStatusDonut } from '../features/dashboard/quiz-status-donut'
import { StatusBadge } from '../features/quizzes/status-badge'
import { StatTile } from '../features/analytics/stat-tile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 10

const RANGE_LABELS: Record<DashboardRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}

function formatDueAt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AdminDashboard() {
  const [range, setRange] = useState<DashboardRange>('30d')
  const [page, setPage] = useState(1)
  const [statsOpen, setStatsOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-admin', range],
    queryFn: () => dashboardApi.adminOverview(range),
  })
  const { data: calendarAssignments } = useQuery({
    queryKey: ['dashboard-calendar'],
    queryFn: dashboardApi.calendar,
  })

  const quizzes = data?.quizzes ?? []
  const totalPages = Math.max(1, Math.ceil(quizzes.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageQuizzes = quizzes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const rangeStart = quizzes.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, quizzes.length)

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Admin dashboard</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Overview of quiz activity and workspace performance.
          </p>
        </div>
        <Button asChild>
          <Link to="/teacher/quizzes/new">Create quiz</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <Card className="rounded-md">
            <button
              type="button"
              onClick={() => setStatsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 text-left"
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-[12.5px] font-bold text-gray-800">Overview</span>
                {!statsOpen && !isLoading && data && (
                  <span className="truncate text-xs text-muted-foreground">
                    {data.stats.totalQuizzes} quizzes · {data.stats.totalMembers} members ·{' '}
                    {data.stats.totalAttempts} attempts ·{' '}
                    {data.stats.averageScorePercent !== null
                      ? `${data.stats.averageScorePercent}%`
                      : '—'}{' '}
                    avg score
                  </span>
                )}
              </div>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${statsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {statsOpen && (
              <CardContent>
                {isLoading || !data ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatTile
                      label="Total quizzes"
                      value={String(data.stats.totalQuizzes)}
                      icon={ClipboardList}
                      footer="Across all time"
                    />
                    <StatTile
                      label="Total members"
                      value={String(data.stats.totalMembers)}
                      icon={Users}
                      footer="Across all time"
                    />
                    <StatTile
                      label="Total attempts"
                      value={String(data.stats.totalAttempts)}
                      icon={CheckCircle2}
                      footer="Across all quizzes"
                    />
                    <StatTile
                      label="Average score"
                      value={
                        data.stats.averageScorePercent !== null
                          ? `${data.stats.averageScorePercent}%`
                          : '—'
                      }
                      icon={Percent}
                      footer="Across all quizzes"
                    />
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-md lg:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Attempts over time</CardTitle>
                <Select value={range} onValueChange={(v) => setRange(v as DashboardRange)}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RANGE_LABELS) as DashboardRange[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {RANGE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <Skeleton className="h-[220px] w-full" />
                ) : (
                  <AttemptsOverTimeChart data={data.attemptsOverTime} />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle>Quiz status</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading || !data ? (
                  <Skeleton className="h-[140px] w-full" />
                ) : (
                  <QuizStatusDonut data={data.quizStatusBreakdown} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-md">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Recent quizzes</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link to="/teacher">View all quizzes</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : quizzes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No quizzes yet.
                </p>
              ) : (
                <>
                  <Table containerClassName="rounded-md">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Avg score</TableHead>
                        <TableHead>Last updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageQuizzes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium text-gray-800">
                            <Link to={`/teacher/quizzes/${q.id}`} className="hover:text-primary">
                              {q.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={q.status} />
                          </TableCell>
                          <TableCell>{q.attemptCount}</TableCell>
                          <TableCell>
                            {q.averageScorePercent !== null ? `${q.averageScorePercent}%` : '—'}
                          </TableCell>
                          <TableCell>
                            {new Date(q.updatedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[12.5px] text-muted-foreground">
                      Showing {rangeStart} to {rangeEnd} of {quizzes.length} quizzes
                    </p>
                    <Pagination
                      page={currentPage}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="w-full space-y-4 xl:w-80 xl:shrink-0">
          <AdminQuizCalendar assignments={calendarAssignments ?? []} className="rounded-md" />

          <Card className="rounded-md">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Upcoming quizzes</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/teacher">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? (
                <Skeleton className="h-24 w-full" />
              ) : data.upcomingQuizzes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing due soon.</p>
              ) : (
                <ul className="space-y-3">
                  {data.upcomingQuizzes.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <Link
                          to={`/teacher/quizzes/${u.quizId}`}
                          className="block truncate font-medium text-gray-800 hover:text-primary"
                        >
                          {u.quizTitle}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatDueAt(u.dueAt)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        Upcoming
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <Link
                to="/teacher/quizzes/new"
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">Create quiz</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Build a new quiz for your workspace
                  </p>
                </div>
              </Link>
              <Link
                to="/teacher"
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ClipboardList className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">Manage quizzes</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Edit, publish, and review quizzes
                  </p>
                </div>
              </Link>
              <Link
                to="/admin/members"
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">Manage members</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Invite or manage workspace members
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardContent className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HelpCircle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">Need help?</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Visit our help center for guides and FAQs.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/help">Visit help center</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
