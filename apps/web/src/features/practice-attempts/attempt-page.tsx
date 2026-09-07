import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calculator as CalculatorIcon,
  ChevronDown,
  Clock,
  Flag,
  HelpCircle,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  Star,
} from 'lucide-react'
import {
  QUIZ_MODULE_SEQUENCE,
  QUIZ_MODULE_LABELS,
  QUIZ_MODULE_TIME_LIMIT_SEC,
  moduleAllowsCalculator,
  isSubjectBoundary,
} from '@quiz-platform/shared'
import { ApiError } from '../../lib/api-client'
import { AnswerInputField } from './answer-input/answer-input-field'
import { practiceAttemptsApi } from './api'
import { Calculator } from './calculator'
import type { AttemptQuestion } from './types'
import { useAntiLeakGuard } from './use-anti-leak-guard'
import { DifficultyBadge } from '@/components/difficulty-badge'
import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { MathText } from '@/components/math/math-text'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CircularProgress } from '@/components/ui/circular-progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Pagination } from '@/components/ui/pagination'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const AUTOSAVE_DEBOUNCE_MS = 600
const PAGE_SIZE = 5

type NavFilter = 'current' | 'unanswered' | 'answered' | 'marked'

const NAV_FILTERS: { key: NavFilter; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'answered', label: 'Answered' },
  { key: 'marked', label: 'Marked' },
]

function formatTime(totalSec: number) {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function isQuestionAnswered(
  question: AttemptQuestion,
  answer: unknown,
  fileKey: string | null,
) {
  if (question.type === 'FILE_UPLOAD') return !!fileKey
  if (!answer || typeof answer !== 'object') return false
  const v = answer as Record<string, unknown>
  if ('optionId' in v) return !!v.optionId
  if ('optionIds' in v) return Array.isArray(v.optionIds) && v.optionIds.length > 0
  if ('text' in v) return typeof v.text === 'string' && v.text.trim() !== ''
  if ('value' in v) return v.value !== null && v.value !== undefined
  if ('selections' in v) return Array.isArray(v.selections) && v.selections.length > 0
  if ('answers' in v) {
    return Array.isArray(v.answers) && v.answers.some((a) => typeof a === 'string' && a.trim() !== '')
  }
  return false
}

function questionCardId(questionId: string) {
  return `attempt-question-${questionId}`
}

function markedStorageKey(attemptId: string) {
  return `quiz-platform:marked-questions:${attemptId}`
}

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Clock
  label: string
  value: string
  caption?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-400">{caption ?? ' '}</p>
    </div>
  )
}

export function PracticeAttemptPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: attempt, isLoading } = useQuery({
    queryKey: ['practice-attempt', id],
    queryFn: () => practiceAttemptsApi.get(id!),
    enabled: !!id,
  })

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [fileKeys, setFileKeys] = useState<Record<string, string | null>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [navFilter, setNavFilter] = useState<NavFilter>('current')
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [sessionLostMessage, setSessionLostMessage] = useState<string | null>(null)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const obscured = useAntiLeakGuard(true)

  const seededAttemptId = useRef<string | null>(null)
  useEffect(() => {
    if (attempt && seededAttemptId.current !== attempt.id) {
      const initialAnswers: Record<string, unknown> = {}
      const initialFileKeys: Record<string, string | null> = {}
      for (const q of attempt.questions) {
        initialAnswers[q.id] = q.answer
        initialFileKeys[q.id] = q.fileKey
      }
      setAnswers(initialAnswers)
      setFileKeys(initialFileKeys)
      setCurrentPage(1)
      setActiveQuestionId(attempt.questions[0]?.id ?? null)
      try {
        const raw = localStorage.getItem(markedStorageKey(attempt.id))
        setMarkedIds(new Set(raw ? (JSON.parse(raw) as string[]) : []))
      } catch {
        setMarkedIds(new Set())
      }
      seededAttemptId.current = attempt.id
    }
  }, [attempt])

  // A 403 from any attempt-mutating call means this attempt's session lock
  // is now held by another device (or was force-released by a teacher) —
  // surfaced as a blocking banner rather than a per-field error, since
  // continuing to edit here would just be discarded.
  const handlePossibleLockLoss = (err: unknown) => {
    if (err instanceof ApiError && err.status === 403) {
      setSessionLostMessage(err.message)
      return true
    }
    return false
  }

  const saveMutation = useMutation({
    mutationFn: ({
      questionId,
      data,
    }: {
      questionId: string
      data: { answer?: unknown; fileKey?: string }
    }) => practiceAttemptsApi.saveResponse(id!, questionId, data),
    onError: handlePossibleLockLoss,
  })

  const completeModuleMutation = useMutation({
    mutationFn: () => practiceAttemptsApi.completeCurrentModule(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['practice-attempt', id], updated)
      queryClient.invalidateQueries({ queryKey: ['practice-assignments-mine'] })
      setSubmitError(null)
      setConfirmSubmitOpen(false)
    },
    onError: (err: unknown) => {
      setConfirmSubmitOpen(false)
      if (handlePossibleLockLoss(err)) return
      setSubmitError(err instanceof ApiError ? err.message : 'Could not submit')
    },
  })

  const beginNextModuleMutation = useMutation({
    mutationFn: () => practiceAttemptsApi.beginNextModule(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['practice-attempt', id], updated)
      setSubmitError(null)
    },
    onError: (err: unknown) => {
      if (handlePossibleLockLoss(err)) return
      setSubmitError(err instanceof ApiError ? err.message : 'Could not start the next module')
    },
  })

  // Periodically proves this tab/device is still the one taking the test —
  // see SESSION_LOCK_TIMEOUT_MS on the API side. Stops once the attempt is
  // no longer in progress or the lock is already known lost.
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS' || sessionLostMessage) return
    const HEARTBEAT_INTERVAL_MS = 25_000
    const attemptId = attempt.id
    const tick = async () => {
      try {
        await practiceAttemptsApi.heartbeat(attemptId)
      } catch (err) {
        handlePossibleLockLoss(err)
      }
    }
    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, attempt?.status, sessionLostMessage])
  const completeModuleRef = useRef(completeModuleMutation.mutate)
  completeModuleRef.current = completeModuleMutation.mutate

  const onAnswerChange = (questionId: string, answer: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    clearTimeout(debounceTimers.current[questionId])
    debounceTimers.current[questionId] = setTimeout(() => {
      setSavingIds((prev) => new Set(prev).add(questionId))
      saveMutation.mutate(
        { questionId, data: { answer } },
        {
          onSettled: () =>
            setSavingIds((prev) => {
              const next = new Set(prev)
              next.delete(questionId)
              return next
            }),
        },
      )
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  // A completed upload is a discrete event, not continuous typing — save
  // immediately rather than debouncing.
  const onFileUploaded = (questionId: string, fileKey: string) => {
    setFileKeys((prev) => ({ ...prev, [questionId]: fileKey }))
    setSavingIds((prev) => new Set(prev).add(questionId))
    saveMutation.mutate(
      { questionId, data: { fileKey } },
      {
        onSettled: () =>
          setSavingIds((prev) => {
            const next = new Set(prev)
            next.delete(questionId)
            return next
          }),
      },
    )
  }

  const toggleMarked = (questionId: string) => {
    if (!attempt) return
    setMarkedIds((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      try {
        localStorage.setItem(markedStorageKey(attempt.id), JSON.stringify([...next]))
      } catch {
        // best-effort — marks just won't survive a reload
      }
      return next
    })
  }

  const onSubmit = () => {
    setConfirmSubmitOpen(true)
  }

  const onJumpToQuestion = (questionId: string) => {
    if (!attempt) return
    const idx = attempt.questions.findIndex((q) => q.id === questionId)
    if (idx === -1) return
    setActiveQuestionId(questionId)
    setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1)
    window.setTimeout(() => {
      const el = document.getElementById(questionCardId(questionId))
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary')
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1500)
    }, 50)
  }

  const onPageChange = (page: number) => {
    setCurrentPage(page)
    const first = attempt?.questions[(page - 1) * PAGE_SIZE]
    if (first) setActiveQuestionId(first.id)
  }

  // Countdown timer for the active module — the deadline is an absolute
  // server timestamp (moduleDeadlineAt), enforced server-side too (see
  // AttemptsService.enforceModuleDeadline), so this is a display + UX nicety
  // rather than the sole enforcement.
  useEffect(() => {
    if (!attempt || !attempt.moduleDeadlineAt || attempt.status !== 'IN_PROGRESS') {
      setRemainingSec(null)
      return
    }
    const deadline = new Date(attempt.moduleDeadlineAt).getTime()
    let autoSubmitted = false
    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemainingSec(remaining)
      if (remaining <= 0 && !autoSubmitted) {
        autoSubmitted = true
        completeModuleRef.current()
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [attempt?.id, attempt?.status, attempt?.moduleDeadlineAt])

  // Between modules, same-subject transitions (e.g. R&W Module 1 -> Module
  // 2) advance immediately with no visible break; only the R&W->Math
  // boundary shows a break screen requiring an explicit "Continue" click
  // (rendered below, via the isBreakBoundary check).
  const autoAdvancedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS' || attempt.currentModule) return
    const nextModule = QUIZ_MODULE_SEQUENCE.find((m) => !attempt.completedModules.includes(m))
    if (!nextModule) return
    const lastCompleted = attempt.completedModules[attempt.completedModules.length - 1]
    const isBreakBoundary = lastCompleted && isSubjectBoundary(lastCompleted, nextModule)
    if (isBreakBoundary) return
    if (autoAdvancedRef.current === attempt.id + nextModule) return
    autoAdvancedRef.current = attempt.id + nextModule
    beginNextModuleMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, attempt?.status, attempt?.currentModule, attempt?.completedModules])

  // Time spent — ticks live while in progress, freezes at submission time.
  useEffect(() => {
    if (!attempt) return
    const start = new Date(attempt.startedAt).getTime()
    if (attempt.status !== 'IN_PROGRESS') {
      const end = attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : Date.now()
      setElapsedSec(Math.max(0, Math.floor((end - start) / 1000)))
      return
    }
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [attempt?.id, attempt?.status, attempt?.startedAt, attempt?.submittedAt])

  if (isLoading || !attempt) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    )
  }

  const readOnly = attempt.status !== 'IN_PROGRESS' || !!sessionLostMessage
  const betweenModules = attempt.status === 'IN_PROGRESS' && !attempt.currentModule

  const totalPoints = attempt.questions.reduce((sum, q) => sum + Number(q.points), 0)
  const uniformPoints =
    attempt.questions.length > 0 && attempt.questions.every((q) => q.points === attempt.questions[0].points)
      ? attempt.questions[0].points
      : null

  const answeredMap = new Map(
    attempt.questions.map((q) => [
      q.id,
      isQuestionAnswered(q, q.type === 'FILE_UPLOAD' ? null : answers[q.id], fileKeys[q.id] ?? null),
    ]),
  )
  const answeredCount = [...answeredMap.values()].filter(Boolean).length
  const answeredPoints = attempt.questions.reduce(
    (sum, q) => sum + (answeredMap.get(q.id) ? Number(q.points) : 0),
    0,
  )
  const progressPct = totalPoints > 0 ? Math.round((answeredPoints / totalPoints) * 100) : 0

  const totalPages = Math.max(1, Math.ceil(attempt.questions.length / PAGE_SIZE))
  const boundedPage = Math.min(currentPage, totalPages)
  const pageStart = (boundedPage - 1) * PAGE_SIZE
  const pageQuestions = attempt.questions.slice(pageStart, pageStart + PAGE_SIZE)

  const timeLimitValue = attempt.currentModule
    ? `${Math.round(QUIZ_MODULE_TIME_LIMIT_SEC[attempt.currentModule] / 60)} min`
    : 'Untimed'

  const nextModule = QUIZ_MODULE_SEQUENCE.find((m) => !attempt.completedModules.includes(m))
  const lastCompletedModule = attempt.completedModules[attempt.completedModules.length - 1]
  const isBreakBoundary =
    attempt.status === 'IN_PROGRESS' &&
    !attempt.currentModule &&
    !!nextModule &&
    !!lastCompletedModule &&
    isSubjectBoundary(lastCompletedModule, nextModule)
  const isLastModule = attempt.currentModule === QUIZ_MODULE_SEQUENCE[QUIZ_MODULE_SEQUENCE.length - 1]
  const calculatorAllowed = !!attempt.currentModule && moduleAllowsCalculator(attempt.currentModule)

  return (
    <div className="w-full pb-16">
      {obscured && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 text-center text-white backdrop-blur-sm">
          <p className="max-w-xs text-sm font-medium">
            Quiz content is hidden while this tab isn't in focus.
            <br />
            Return to this tab to keep working.
          </p>
        </div>
      )}
      <Link
        to="/student/practice-quizzes"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="size-3.5" />
        Back to practice quizzes
      </Link>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[17px] font-bold text-gray-900">{attempt.quizTitle}</h1>
              <p className="text-sm text-muted-foreground">
                Attempt #{attempt.attemptNumber}
                {attempt.currentModule && ` · ${QUIZ_MODULE_LABELS[attempt.currentModule]}`}
                {betweenModules && ' · Between modules'}
                {attempt.status === 'SUBMITTED' && ' · Submitted, awaiting grading'}
                {attempt.status === 'GRADED' && (
                  <span className="font-medium text-emerald-700">
                    {' '}
                    · Score: {attempt.score}/{attempt.maxScore}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {remainingSec !== null && attempt.status === 'IN_PROGRESS' && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'gap-1.5 border-transparent font-medium tabular-nums',
                    remainingSec < 60
                      ? 'bg-red-50 text-red-700 [&>svg]:text-red-500'
                      : 'bg-muted text-foreground [&>svg]:text-muted-foreground',
                  )}
                >
                  <Clock className="size-3.5" />
                  {formatTime(remainingSec)}
                </Badge>
              )}
              {!readOnly && !betweenModules && (
                <Button type="button" onClick={onSubmit} disabled={completeModuleMutation.isPending}>
                  {completeModuleMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Submitting…
                    </>
                  ) : isLastModule ? (
                    'Submit quiz'
                  ) : (
                    'Submit module'
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={Clock} label="Time limit" value={timeLimitValue} caption={attempt.currentModule ? undefined : 'No time limit'} />
            <StatTile icon={ListChecks} label="Total questions" value={String(attempt.questions.length)} />
            <StatTile
              icon={Star}
              label="Total points"
              value={String(totalPoints)}
              caption={uniformPoints ? `${uniformPoints} pts per question` : undefined}
            />
            <StatTile
              icon={RefreshCw}
              label="Attempt"
              value={`${attempt.attemptNumber} of ${attempt.maxAttempts ?? '∞'}`}
              caption={
                attempt.attemptsRemaining != null
                  ? `${attempt.attemptsRemaining} attempt${attempt.attemptsRemaining === 1 ? '' : 's'} remaining`
                  : 'Unlimited attempts'
              }
            />
          </div>

          {sessionLostMessage && (
            <Alert variant="destructive">
              <AlertDescription>
                {sessionLostMessage} Reload the page and sign in again to keep answering here.
              </AlertDescription>
            </Alert>
          )}
          {attempt.status === 'IN_PROGRESS' && !betweenModules && !sessionLostMessage && (
            <Alert>
              <Info />
              <AlertDescription>
                Your progress is automatically saved. You can submit anytime before finishing.
              </AlertDescription>
            </Alert>
          )}
          {attempt.status === 'SUBMITTED' && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-700">
                This attempt has been submitted and is awaiting grading.
              </AlertDescription>
            </Alert>
          )}
          {attempt.status === 'GRADED' && (
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-700">Graded</p>
                <p className="text-lg font-semibold text-emerald-700">
                  Final score: {attempt.score}/{attempt.maxScore}
                </p>
              </CardContent>
            </Card>
          )}
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {betweenModules && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                {isBreakBoundary ? (
                  <>
                    <p className="text-lg font-bold text-gray-900">Take a break</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      You've finished the Reading &amp; Writing section. Take a short break, then
                      continue whenever you're ready — {nextModule && QUIZ_MODULE_LABELS[nextModule]}{' '}
                      starts once you click continue.
                    </p>
                    <Button
                      type="button"
                      onClick={() => beginNextModuleMutation.mutate()}
                      disabled={beginNextModuleMutation.isPending}
                    >
                      {beginNextModuleMutation.isPending ? (
                        <>
                          <Loader2 className="animate-spin" />
                          Starting…
                        </>
                      ) : (
                        `Continue to ${nextModule ? QUIZ_MODULE_LABELS[nextModule] : 'next module'}`
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Moving on to the next module…</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {!betweenModules && (
          <>
          <div className="space-y-4">
            {pageQuestions.map((q) => {
              const globalIndex = attempt.questions.findIndex((x) => x.id === q.id)
              const marked = markedIds.has(q.id)
              return (
                <Card key={q.id} id={questionCardId(q.id)} className="scroll-mt-4">
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[12px] font-semibold text-gray-600">
                          {globalIndex + 1}
                        </span>
                        <div>
                          {q.difficulty && (
                            <DifficultyBadge difficulty={q.difficulty} />
                          )}
                          <p
                            className={cn(
                              'text-[14.5px] font-medium text-gray-900 select-none',
                              q.difficulty && 'mt-1',
                            )}
                          >
                            <MathText text={q.prompt} />
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[12.5px] whitespace-nowrap text-gray-400">
                          {q.awardedPoints !== null
                            ? `${q.awardedPoints}/${q.points} pts`
                            : `${q.points} pts`}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => toggleMarked(q.id)}
                            aria-label={marked ? 'Unmark for review' : 'Mark for review'}
                            aria-pressed={marked}
                            className={cn(
                              'rounded-md p-1 transition-colors hover:bg-gray-100',
                              marked ? 'text-amber-500' : 'text-gray-300',
                            )}
                          >
                            <Flag className={cn('size-4', marked && 'fill-amber-400')} />
                          </button>
                        )}
                      </div>
                    </div>
                    {q.attachmentFilename && (
                      <DocumentViewer
                        mimeType={q.attachmentMimeType}
                        filename={q.attachmentFilename}
                        path={`/practice-attempts/${attempt.id}/questions/${q.id}/attachment-url`}
                      />
                    )}
                    {q.imageFilename && (
                      <DocumentViewer
                        mimeType={q.imageMimeType}
                        filename={q.imageFilename}
                        path={`/practice-attempts/${attempt.id}/questions/${q.id}/image-url`}
                      />
                    )}
                    <AnswerInputField
                      question={q}
                      attemptId={attempt.id}
                      value={
                        q.type === 'FILE_UPLOAD'
                          ? (fileKeys[q.id] ?? null)
                          : (answers[q.id] ?? null)
                      }
                      onChange={(value) =>
                        q.type === 'FILE_UPLOAD'
                          ? onFileUploaded(q.id, value as string)
                          : onAnswerChange(q.id, value)
                      }
                      readOnly={readOnly}
                    />
                    {savingIds.has(q.id) && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Saving…
                      </p>
                    )}
                    {q.feedback && (
                      <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Feedback:</span>{' '}
                        <MathText text={q.feedback} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <p className="text-[12.5px] text-gray-500">
              Questions {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, attempt.questions.length)} of{' '}
              {attempt.questions.length}
            </p>
            <Pagination page={boundedPage} totalPages={totalPages} onPageChange={onPageChange} />
          </div>
          </>
          )}
        </div>

        {!betweenModules && (
        <aside className="w-full space-y-4 xl:w-80 xl:shrink-0">
          {calculatorAllowed && (
            <Card>
              <CardContent>
                <Collapsible open={calculatorOpen} onOpenChange={setCalculatorOpen}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between">
                    <span className="flex items-center gap-2 text-[13px] font-bold text-gray-800">
                      <CalculatorIcon className="size-4 text-gray-400" />
                      Calculator
                    </span>
                    <ChevronDown
                      className={cn('size-4 text-gray-400 transition-transform', calculatorOpen && 'rotate-180')}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <Calculator />
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col items-center gap-4">
              <p className="self-start text-[13px] font-bold text-gray-800">Your progress</p>
              <CircularProgress value={progressPct} size={112} strokeWidth={10}>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{progressPct}%</p>
                  <p className="text-[11px] text-gray-400">
                    {answeredPoints}/{totalPoints} pts
                  </p>
                </div>
              </CircularProgress>
              <div className="w-full space-y-2 border-t border-gray-100 pt-3 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Answered</span>
                  <span className="font-semibold text-gray-900">{answeredCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unanswered</span>
                  <span className="font-semibold text-gray-900">
                    {attempt.questions.length - answeredCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time spent</span>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {formatDuration(elapsedSec)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-[13px] font-bold text-gray-800">Question navigator</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {NAV_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setNavFilter(f.key)}
                    className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-800"
                  >
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-full border',
                        navFilter === f.key ? 'border-primary-600 bg-primary-600' : 'border-gray-300',
                      )}
                    />
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 border-t border-gray-100 pt-3">
                {attempt.questions.map((q, i) => {
                  const answered = !!answeredMap.get(q.id)
                  const marked = markedIds.has(q.id)
                  const isActive = q.id === activeQuestionId
                  const dimmed =
                    (navFilter === 'unanswered' && answered) ||
                    (navFilter === 'answered' && !answered) ||
                    (navFilter === 'marked' && !marked)
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onJumpToQuestion(q.id)}
                      aria-label={`Go to question ${i + 1}`}
                      className={cn(
                        'relative flex h-9 items-center justify-center rounded-lg border text-[12.5px] font-semibold transition-colors',
                        answered
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                        isActive && 'ring-2 ring-primary-400 ring-offset-1',
                        dimmed && 'opacity-30',
                      )}
                    >
                      {i + 1}
                      {marked && (
                        <Flag className="absolute -top-1.5 -right-1.5 size-3 fill-amber-400 text-amber-500" />
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="size-4 text-gray-400" />
                <p className="text-[13px] font-bold text-gray-800">Need help?</p>
              </div>
              <p className="text-[12px] text-gray-500">
                Check out our help center for guides and FAQs.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/help">Visit help center</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
        )}
      </div>

      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isLastModule ? 'Submit this attempt?' : 'Submit this module?'}</DialogTitle>
            <DialogDescription>
              {isLastModule
                ? 'You will not be able to change your answers afterward.'
                : "You won't be able to return to this module once you continue."}
              {attempt.questions.length - answeredCount > 0 && (
                <>
                  {' '}
                  You have {attempt.questions.length - answeredCount} unanswered question
                  {attempt.questions.length - answeredCount === 1 ? '' : 's'}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmSubmitOpen(false)}
              disabled={completeModuleMutation.isPending}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => completeModuleMutation.mutate()}
              disabled={completeModuleMutation.isPending}
            >
              {completeModuleMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Submitting…
                </>
              ) : isLastModule ? (
                'Submit quiz'
              ) : (
                'Submit module'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
