import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Clock, Loader2 } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { AnswerInputField } from './answer-input/answer-input-field'
import { attemptsApi } from './api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const AUTOSAVE_DEBOUNCE_MS = 600

function formatTime(totalSec: number) {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AttemptPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: attempt, isLoading } = useQuery({
    queryKey: ['attempt', id],
    queryFn: () => attemptsApi.get(id!),
    enabled: !!id,
  })

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [fileKeys, setFileKeys] = useState<Record<string, string | null>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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
      seededAttemptId.current = attempt.id
    }
  }, [attempt])

  const saveMutation = useMutation({
    mutationFn: ({
      questionId,
      data,
    }: {
      questionId: string
      data: { answer?: unknown; fileKey?: string }
    }) => attemptsApi.saveResponse(id!, questionId, data),
  })

  const submitMutation = useMutation({
    mutationFn: () => attemptsApi.submit(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attempt', id] })
      queryClient.invalidateQueries({ queryKey: ['assignments-mine'] })
      setSubmitError(null)
    },
    onError: (err: unknown) =>
      setSubmitError(err instanceof ApiError ? err.message : 'Could not submit'),
  })
  const submitRef = useRef(submitMutation.mutate)
  submitRef.current = submitMutation.mutate

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

  const onSubmit = () => {
    if (
      !window.confirm(
        'Submit this attempt? You will not be able to change your answers afterward.',
      )
    ) {
      return
    }
    submitMutation.mutate()
  }

  // Countdown timer — client-side only, auto-submits at zero (see Phase 3
  // plan: no server-side time-limit enforcement yet).
  useEffect(() => {
    if (!attempt || !attempt.timeLimitSec || attempt.status !== 'IN_PROGRESS') {
      setRemainingSec(null)
      return
    }
    const deadline = new Date(attempt.startedAt).getTime() + attempt.timeLimitSec * 1000
    let autoSubmitted = false
    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemainingSec(remaining)
      if (remaining <= 0 && !autoSubmitted) {
        autoSubmitted = true
        submitRef.current()
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [attempt?.id, attempt?.status, attempt?.timeLimitSec, attempt?.startedAt, attempt])

  if (isLoading || !attempt) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    )
  }

  const readOnly = attempt.status !== 'IN_PROGRESS'

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <div className="sticky top-0 z-10 -mx-1 mb-6 flex items-center justify-between border-b bg-background px-1 py-3">
        <div>
          <h1 className="text-lg font-semibold">{attempt.quizTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Attempt #{attempt.attemptNumber}
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
          {!readOnly && (
            <Button type="button" onClick={onSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit'
              )}
            </Button>
          )}
        </div>
      </div>

      {attempt.status === 'SUBMITTED' && (
        <Alert className="mb-4 border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-700">
            This attempt has been submitted and is awaiting grading.
          </AlertDescription>
        </Alert>
      )}
      {attempt.status === 'GRADED' && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-700">Graded</p>
            <p className="text-lg font-semibold text-emerald-700">
              Final score: {attempt.score}/{attempt.maxScore}
            </p>
          </CardContent>
        </Card>
      )}
      {submitError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {attempt.questions.map((q, i) => (
          <Card key={q.id}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-medium">
                  {i + 1}. {q.prompt}
                </p>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {q.awardedPoints !== null
                    ? `${q.awardedPoints}/${q.points} pts`
                    : `${q.points} pts`}
                </span>
              </div>
              <AnswerInputField
                question={q}
                attemptId={attempt.id}
                value={
                  q.type === 'FILE_UPLOAD' ? (fileKeys[q.id] ?? null) : (answers[q.id] ?? null)
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
                  <span className="font-medium text-foreground">Feedback:</span> {q.feedback}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
