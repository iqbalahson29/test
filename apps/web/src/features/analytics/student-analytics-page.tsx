import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Filter,
  Percent,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { analyticsApi } from './api'
import type { MyAttemptAnalytics } from './types'
import { StatTile } from './stat-tile'
import { assignmentsApi } from '../assignments/api'
import { groupByBucket } from '../assignments/bucket'
import { UpcomingCalendar } from '../attempts/upcoming-calendar'
import { RecentActivity } from '../attempts/recent-activity'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const LINE_COLOR = 'rgb(74 21 75)'
const PAGE_SIZE = 5

type RangeKey = '30' | '90' | '365' | 'all'
const RANGE_LABELS: Record<RangeKey, string> = {
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  '365': 'Last 12 months',
  all: 'All time',
}

type AttemptTab = 'all' | 'GRADED' | 'SUBMITTED' | 'IN_PROGRESS'
const ATTEMPT_TAB_LABELS: Record<AttemptTab, string> = {
  all: 'All quizzes',
  GRADED: 'Completed',
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'In progress',
}
const ATTEMPT_TAB_ORDER: AttemptTab[] = ['all', 'GRADED', 'SUBMITTED', 'IN_PROGRESS']

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest'
const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  highest: 'Highest score',
  lowest: 'Lowest score',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'GRADED':
      return 'bg-emerald-50 text-emerald-700'
    case 'SUBMITTED':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-blue-50 text-blue-700'
  }
}

export function StudentAnalyticsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['my-analytics'],
    queryFn: analyticsApi.mine,
  })
  const { data: assignments } = useQuery({
    queryKey: ['assignments-mine'],
    queryFn: assignmentsApi.mine,
  })

  const [range, setRange] = useState<RangeKey>('90')
  const [tab, setTab] = useState<AttemptTab>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const now = useMemo(() => Date.now(), [])
  const grouped = useMemo(() => groupByBucket(assignments ?? [], now), [assignments, now])

  const onJump = (assignmentId: string) => {
    navigate('/student', { state: { jumpTo: assignmentId } })
  }

  const trendInRange = useMemo(() => {
    if (!data) return []
    if (range === 'all') return data.trend
    const cutoffDays = Number(range)
    const cutoff = now - cutoffDays * 86_400_000
    return data.trend.filter((t) => new Date(t.submittedAt).getTime() >= cutoff)
  }, [data, range, now])

  const scoreDelta = useMemo(() => {
    if (!data) return null
    const thirtyDays = 30 * 86_400_000
    const current = data.trend.filter((t) => now - new Date(t.submittedAt).getTime() <= thirtyDays)
    const previous = data.trend.filter((t) => {
      const age = now - new Date(t.submittedAt).getTime()
      return age > thirtyDays && age <= thirtyDays * 2
    })
    const avg = (arr: typeof current) =>
      arr.length ? arr.reduce((s, t) => s + t.percent, 0) / arr.length : null
    const currentAvg = avg(current)
    const previousAvg = avg(previous)
    if (currentAvg == null || previousAvg == null) return null
    return Math.round((currentAvg - previousAvg) * 100) / 100
  }, [data, now])

  const filteredAttempts = useMemo(() => {
    let rows = data?.attempts ?? []
    if (tab !== 'all') {
      rows = rows.filter((a) => a.status === tab)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((a) => a.quizTitle.toLowerCase().includes(q))
    }
    const sorted = [...rows].sort((a, b) => {
      if (sort === 'highest' || sort === 'lowest') {
        const aP = a.percent ?? -1
        const bP = b.percent ?? -1
        return sort === 'highest' ? bP - aP : aP - bP
      }
      const aT = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
      const bT = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
      return sort === 'newest' ? bT - aT : aT - bT
    })
    return sorted
  }, [data, tab, search, sort])

  const totalPages = Math.max(1, Math.ceil(filteredAttempts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageAttempts = filteredAttempts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  const onTabChange = (t: AttemptTab) => {
    setTab(t)
    setPage(1)
  }

  const tabCount = (t: AttemptTab) =>
    t === 'all' ? (data?.attempts.length ?? 0) : (data?.attempts.filter((a) => a.status === t).length ?? 0)

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const totalQuizzes = assignments?.length ?? 0
  const completedCount = grouped.completed.length
  const inProgressCount = grouped.inProgress.length
  const completedPct = totalQuizzes > 0 ? Math.round((completedCount / totalQuizzes) * 100) : 0

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">My analytics</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Track your performance and quiz activity over time.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Average score (graded)"
            value={data.averagePercent !== null ? `${data.averagePercent}%` : '—'}
            icon={Percent}
            footer={
              scoreDelta !== null ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1',
                    scoreDelta >= 0 ? 'text-emerald-600' : 'text-destructive',
                  )}
                >
                  {scoreDelta >= 0 ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {Math.abs(scoreDelta)}% vs last 30 days
                </span>
              ) : undefined
            }
          />
          <StatTile
            label="Total quizzes"
            value={String(totalQuizzes)}
            icon={ClipboardList}
            footer="Across all time"
          />
          <StatTile
            label="Completed"
            value={String(completedCount)}
            icon={CheckCircle2}
            footer={`${completedPct}% of total`}
          />
          <StatTile
            label="In progress"
            value={String(inProgressCount)}
            icon={Clock}
            footer={inProgressCount > 0 ? 'Keep it up!' : undefined}
          />
        </div>

        {data.trend.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-[12.5px] font-bold text-gray-800">Score trend</h2>
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RANGE_LABELS) as RangeKey[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {RANGE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {trendInRange.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No graded attempts in this range.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendInRange}>
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
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-0">
            <div className="flex items-center gap-5 overflow-x-auto">
              {ATTEMPT_TAB_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTabChange(t)}
                  className={cn(
                    '-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                    t === tab
                      ? 'border-primary-600 text-gray-900'
                      : 'border-transparent text-gray-400 hover:text-gray-600',
                  )}
                >
                  {ATTEMPT_TAB_LABELS[t]}
                  <span className={cn('text-[11px]', t === tab ? 'text-primary-600' : 'text-gray-300')}>
                    {tabCount(t)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter />
                    Filters
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                  <div className="space-y-1.5">
                    <label htmlFor="quiz-search" className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
                      Quiz name
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="quiz-search"
                        placeholder="Search…"
                        className="pl-8"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value)
                          setPage(1)
                        }}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger size="sm" className="w-48">
                  <span className="text-gray-400">Sort:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SORT_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
              {pageAttempts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No attempts match this view.
                  </TableCell>
                </TableRow>
              )}
              {pageAttempts.map((a: MyAttemptAnalytics) => (
                <TableRow
                  key={a.attemptId}
                  className="cursor-pointer"
                  onClick={() => navigate(`/student/attempts/${a.attemptId}`)}
                >
                  <TableCell className="text-[13px] font-medium text-gray-900">
                    {a.quizTitle}
                  </TableCell>
                  <TableCell>#{a.attemptNumber}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase',
                        statusBadgeClass(a.status),
                      )}
                    >
                      {a.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.percent !== null ? `${a.percent}% (${a.score}/${a.maxScore})` : '—'}
                  </TableCell>
                  <TableCell>
                    {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-[12.5px] text-gray-500">
              {filteredAttempts.length === 0
                ? 'Showing 0 quizzes'
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} to ${Math.min(currentPage * PAGE_SIZE, filteredAttempts.length)} of ${filteredAttempts.length} quizzes`}
            </p>
            <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </Card>
      </div>

      <aside className="w-full space-y-4 xl:w-72 xl:shrink-0">
        <UpcomingCalendar
          assignments={assignments ?? []}
          onJump={onJump}
          title="Quiz calendar"
        />
        <RecentActivity attempts={data.attempts} />
      </aside>
    </div>
  )
}
