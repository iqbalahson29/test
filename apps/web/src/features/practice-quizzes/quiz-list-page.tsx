import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, ClipboardList, Filter, Search, X } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { practiceAssignmentsApi } from '../practice-assignments/api'
import { practiceQuizzesApi } from './api'
import { ImportQuestionsDialog } from './import-questions-dialog'
import { QuizRowMenu } from './quiz-row-menu'
import { StatusBadge } from './status-badge'
import type { QuizStatus, QuizSummary } from './types'
import { AdminQuizCalendar } from '../dashboard/admin-quiz-calendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { cn } from '@/lib/utils'

const PAGE_SIZE = 8
const UPCOMING_LIMIT = 3

type TabKey = 'ALL' | QuizStatus

const TAB_ORDER: TabKey[] = ['ALL', 'PUBLISHED', 'SCHEDULED', 'DRAFT', 'ARCHIVED']
const TAB_LABELS: Record<TabKey, string> = {
  ALL: 'All practice quizzes',
  PUBLISHED: 'Published',
  SCHEDULED: 'Scheduled',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
}

type SortKey = 'newest' | 'oldest' | 'title' | 'attempts' | 'score'
const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  title: 'Title A–Z',
  attempts: 'Most attempts',
  score: 'Highest avg score',
}
const SORTERS: Record<SortKey, (a: QuizSummary, b: QuizSummary) => number> = {
  newest: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  oldest: (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  title: (a, b) => a.title.localeCompare(b.title),
  attempts: (a, b) => b.attemptCount - a.attemptCount,
  score: (a, b) => (b.averageScorePercent ?? -1) - (a.averageScorePercent ?? -1),
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function relativeFromNow(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `Updated ${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `Updated ${weeks} week${weeks === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30)
  if (months < 12) return `Updated ${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.round(days / 365)
  return `Updated ${years} year${years === 1 ? '' : 's'} ago`
}

function statusActionCopy(quiz: QuizSummary, target: QuizStatus) {
  if (target === 'PUBLISHED' && quiz.status === 'SCHEDULED') {
    return {
      title: 'Publish now?',
      description: `This publishes "${quiz.title}" immediately instead of waiting for its scheduled date.`,
      confirmLabel: 'Publish now',
      destructive: false,
    }
  }
  if (target === 'PUBLISHED') {
    return {
      title: 'Publish quiz?',
      description: `Students will be able to see and start attempts on "${quiz.title}" right away.`,
      confirmLabel: 'Publish',
      destructive: false,
    }
  }
  if (target === 'DRAFT' && quiz.status === 'SCHEDULED') {
    return {
      title: 'Unschedule quiz?',
      description: `This cancels the scheduled publish date and returns "${quiz.title}" to draft.`,
      confirmLabel: 'Unschedule',
      destructive: false,
    }
  }
  if (target === 'DRAFT' && quiz.status === 'ARCHIVED') {
    return {
      title: 'Restore quiz?',
      description: `"${quiz.title}" returns to Draft. All existing attempts and scores are untouched and still there.`,
      confirmLabel: 'Restore',
      destructive: false,
    }
  }
  if (target === 'DRAFT') {
    return {
      title: 'Unpublish quiz?',
      description: `Students will no longer be able to access or start "${quiz.title}".`,
      confirmLabel: 'Unpublish',
      destructive: true,
    }
  }
  return {
    title: 'Archive quiz?',
    description: `"${quiz.title}" will be removed from active listings. You can restore it later from the Archived tab.`,
    confirmLabel: 'Archive',
    destructive: true,
  }
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

export function PracticeQuizListPage() {
  const queryClient = useQueryClient()

  const { data: quizzes, isLoading } = useQuery({ queryKey: ['practice-quizzes'], queryFn: practiceQuizzesApi.list })
  const { data: calendarAssignments } = useQuery({
    queryKey: ['practice-dashboard-calendar'],
    queryFn: practiceAssignmentsApi.calendar,
  })

  const [activeTab, setActiveTab] = useState<TabKey>('ALL')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [minAttempts, setMinAttempts] = useState('')
  const [updatedAfter, setUpdatedAfter] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmAction, setConfirmActionState] = useState<
    { kind: 'status'; quiz: QuizSummary; status: QuizStatus } | { kind: 'delete'; quiz: QuizSummary } | null
  >(null)
  const setConfirmAction = (
    action: { kind: 'status'; quiz: QuizSummary; status: QuizStatus } | { kind: 'delete'; quiz: QuizSummary } | null,
  ) => {
    setActionError(null)
    setConfirmActionState(action)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['practice-quizzes'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-admin'] })
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuizStatus }) =>
      practiceQuizzesApi.updateStatus(id, status),
    onSuccess: () => {
      invalidate()
      setActionError(null)
      setConfirmActionState(null)
    },
    onError: (err: unknown) =>
      setActionError(err instanceof ApiError ? err.message : 'Could not update quiz status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => practiceQuizzesApi.remove(id),
    onSuccess: (_, id) => {
      invalidate()
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setActionError(null)
      setConfirmActionState(null)
    },
    onError: (err: unknown) =>
      setActionError(err instanceof ApiError ? err.message : 'Could not delete quiz'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => practiceQuizzesApi.remove(id))),
    onSuccess: () => {
      invalidate()
      setSelectedIds(new Set())
      setActionError(null)
    },
    onError: (err: unknown) =>
      setActionError(err instanceof ApiError ? err.message : 'Could not delete selected quizzes'),
  })

  const all = useMemo(() => quizzes ?? [], [quizzes])

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      ALL: all.length,
      PUBLISHED: 0,
      SCHEDULED: 0,
      DRAFT: 0,
      ARCHIVED: 0,
    }
    for (const q of all) counts[q.status]++
    return counts
  }, [all])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const minAtt = minAttempts.trim() ? Number(minAttempts) : null
    const afterDate = updatedAfter ? new Date(updatedAfter) : null
    return all
      .filter((q) => activeTab === 'ALL' || q.status === activeTab)
      .filter((q) => !query || q.title.toLowerCase().includes(query))
      .filter((q) => minAtt === null || q.attemptCount >= minAtt)
      .filter((q) => !afterDate || new Date(q.updatedAt).getTime() >= afterDate.getTime())
      .sort(SORTERS[sort])
  }, [all, activeTab, search, sort, minAttempts, updatedAfter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageQuizzes = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  const onTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    setPage(1)
  }

  const filtersActive = minAttempts.trim() !== '' || updatedAfter !== ''

  const allOnPageSelected = pageQuizzes.length > 0 && pageQuizzes.every((q) => selectedIds.has(q.id))
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        for (const q of pageQuizzes) next.delete(q.id)
      } else {
        for (const q of pageQuizzes) next.add(q.id)
      }
      return next
    })
  }
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedQuizzes = all.filter((q) => selectedIds.has(q.id))
  const canBulkDelete = selectedQuizzes.length > 0
  const selectedAttemptCount = selectedQuizzes.reduce((sum, q) => sum + q.attemptCount, 0)

  const onBulkDelete = () => {
    if (!canBulkDelete) return
    const attemptsWarning =
      selectedAttemptCount > 0
        ? ` This permanently deletes ${selectedAttemptCount} student attempt${selectedAttemptCount === 1 ? '' : 's'} and their grades.`
        : ''
    if (
      !window.confirm(
        `Delete ${selectedQuizzes.length} quiz(zes)?${attemptsWarning} This can't be undone.`,
      )
    )
      return
    bulkDeleteMutation.mutate(selectedQuizzes.map((q) => q.id))
  }

  const onRowDelete = (quiz: QuizSummary) => {
    setConfirmAction({ kind: 'delete', quiz })
  }

  const now = useMemo(() => Date.now(), [])
  const upcomingQuizzes = useMemo(() => {
    const soonestByQuiz = new Map<string, NonNullable<typeof calendarAssignments>[number]>()
    for (const a of calendarAssignments ?? []) {
      if (!a.dueAt || new Date(a.dueAt).getTime() < now) continue
      const existing = soonestByQuiz.get(a.quizId)
      if (!existing || new Date(a.dueAt).getTime() < new Date(existing.dueAt!).getTime()) {
        soonestByQuiz.set(a.quizId, a)
      }
    }
    return [...soonestByQuiz.values()].sort(
      (a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime(),
    )
  }, [calendarAssignments, now])

  const actionsPending = statusMutation.isPending || deleteMutation.isPending

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Practice Quizzes</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Create, manage and organize practice quizzes for your workspace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
            Import questions
          </Button>
          <Button asChild>
            <Link to="/teacher/practice-quizzes/new">New practice quiz</Link>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Filters" className="relative">
                <Filter />
                {filtersActive && (
                  <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-updated-after">Updated after</Label>
                  <Input
                    id="filter-updated-after"
                    type="date"
                    value={updatedAfter}
                    onChange={(e) => {
                      setUpdatedAfter(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-min-attempts">Minimum attempts</Label>
                  <Input
                    id="filter-min-attempts"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={minAttempts}
                    onChange={(e) => {
                      setMinAttempts(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
                {filtersActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setMinAttempts('')
                      setUpdatedAfter('')
                      setPage(1)
                    }}
                  >
                    <X />
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-5 overflow-x-auto border-b border-gray-200">
              {TAB_ORDER.map((tab) => (
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
                    {tabCounts[tab]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search practice quizzes…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="w-44 pl-8"
                />
              </div>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      Sort: {SORT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2">
              <p className="text-[12.5px] font-medium text-primary-700">
                {selectedIds.size} selected
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canBulkDelete || bulkDeleteMutation.isPending}
                  onClick={onBulkDelete}
                  className="text-destructive hover:text-destructive"
                >
                  Delete selected
                </Button>
              </div>
            </div>
          )}

          {isLoading || !quizzes ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="rounded-md">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {all.length === 0 ? 'No practice quizzes yet.' : 'No practice quizzes match these filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Table containerClassName="rounded-md">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={toggleSelectAllOnPage}
                        aria-label="Select all quizzes on this page"
                      />
                    </TableHead>
                    <TableHead>Quiz name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Avg score</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageQuizzes.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(q.id)}
                          onCheckedChange={() => toggleSelect(q.id)}
                          aria-label={`Select ${q.title}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <Link
                          to={`/teacher/practice-quizzes/${q.id}`}
                          className="font-medium text-gray-800 hover:text-primary"
                        >
                          {q.title}
                        </Link>
                        <p className="text-[11px] text-gray-400">{relativeFromNow(q.updatedAt)}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={q.status} />
                      </TableCell>
                      <TableCell>{q.questionCount}</TableCell>
                      <TableCell>{q.attemptCount}</TableCell>
                      <TableCell>
                        {q.averageScorePercent !== null ? `${q.averageScorePercent}%` : '—'}
                      </TableCell>
                      <TableCell>{formatDate(q.updatedAt)}</TableCell>
                      <TableCell>
                        <QuizRowMenu
                          quiz={q}
                          disabled={actionsPending}
                          onStatusChange={(status) => setConfirmAction({ kind: 'status', quiz: q, status })}
                          onDelete={() => onRowDelete(q)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] text-muted-foreground">
                  Showing {rangeStart} to {rangeEnd} of {filtered.length} quizzes
                </p>
                <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </div>

        <aside className="w-full space-y-4 xl:w-80 xl:shrink-0">
          <AdminQuizCalendar assignments={calendarAssignments ?? []} className="rounded-md" />

          <Card className="rounded-md">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Upcoming quizzes</CardTitle>
            </CardHeader>
            <CardContent>
              {!calendarAssignments ? (
                <Skeleton className="h-24 w-full" />
              ) : upcomingQuizzes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing due soon.</p>
              ) : (
                <>
                  <ul className="space-y-3">
                    {upcomingQuizzes.slice(0, UPCOMING_LIMIT).map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <Link
                            to={`/teacher/practice-quizzes/${u.quizId}`}
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
                  {upcomingQuizzes.length > UPCOMING_LIMIT && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      + {upcomingQuizzes.length - UPCOMING_LIMIT} more
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ImportQuestionsDialog open={importOpen} onOpenChange={setImportOpen} />

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          {confirmAction &&
            (() => {
              const copy =
                confirmAction.kind === 'delete'
                  ? {
                      title: `Delete "${confirmAction.quiz.title}"?`,
                      description: `This permanently deletes the quiz, its ${confirmAction.quiz.questionCount} question${confirmAction.quiz.questionCount === 1 ? '' : 's'}${
                        confirmAction.quiz.attemptCount > 0
                          ? `, and ${confirmAction.quiz.attemptCount} student attempt${confirmAction.quiz.attemptCount === 1 ? '' : 's'} and their grades`
                          : ''
                      }. This can't be undone.`,
                      confirmLabel: deleteMutation.isPending ? 'Deleting…' : 'Delete quiz',
                      destructive: true,
                    }
                  : {
                      ...statusActionCopy(confirmAction.quiz, confirmAction.status),
                      confirmLabel: statusMutation.isPending
                        ? 'Saving…'
                        : statusActionCopy(confirmAction.quiz, confirmAction.status).confirmLabel,
                    }

              return (
                <>
                  <DialogHeader>
                    <div
                      className={`flex size-9 items-center justify-center rounded-full ${
                        copy.destructive
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      <AlertTriangle className="size-4" />
                    </div>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                  </DialogHeader>
                  {actionError && (
                    <Alert variant="destructive">
                      <AlertDescription>{actionError}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant={copy.destructive ? 'destructive' : 'default'}
                      disabled={statusMutation.isPending || deleteMutation.isPending}
                      onClick={() =>
                        confirmAction.kind === 'delete'
                          ? deleteMutation.mutate(confirmAction.quiz.id)
                          : statusMutation.mutate({ id: confirmAction.quiz.id, status: confirmAction.status })
                      }
                    >
                      {copy.confirmLabel}
                    </Button>
                  </DialogFooter>
                </>
              )
            })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
