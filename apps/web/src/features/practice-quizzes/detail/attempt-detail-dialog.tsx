import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { QUIZ_MODULE_SEQUENCE, QUIZ_MODULE_LABELS } from '@quiz-platform/shared'
import { ApiError } from '../../../lib/api-client'
import { practiceGradingApi } from '../../practice-grading/api'
import { AttemptStatusBadge } from '../../practice-attempts/status-badge'
import { practiceQuizzesApi } from '../api'
import type { AttemptDetailQuestion } from '../types'
import { formatDateTime } from './format'
import { DifficultyBadge } from '@/components/difficulty-badge'
import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { MathText } from '@/components/math/math-text'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function AnswerPreview({
  quizId,
  attemptId,
  q,
}: {
  quizId: string
  attemptId: string
  q: AttemptDetailQuestion
}) {
  const answer = q.answer as Record<string, unknown> | null

  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const onDownload = async () => {
    if (!q.fileKey) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const { downloadUrl } = await practiceGradingApi.getDownloadUrl(q.responseId!)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Could not fetch file')
    } finally {
      setDownloading(false)
    }
  }

  if (q.options.length > 0) {
    const selectedIds = new Set(
      Array.isArray(answer?.optionIds)
        ? (answer!.optionIds as string[])
        : answer?.optionId
          ? [answer.optionId as string]
          : [],
    )
    return (
      <ul className="space-y-1">
        {q.options.map((o) => (
          <li
            key={o.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
              o.isCorrect
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : selectedIds.has(o.id)
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-gray-200 text-gray-600',
            )}
          >
            {selectedIds.has(o.id) && <span className="text-xs font-semibold">Picked:</span>}
            <MathText text={o.text} />
            {o.imageFilename && (
              <DocumentViewer
                mimeType={o.imageMimeType}
                filename={o.imageFilename}
                path={practiceQuizzesApi.attemptOptionImageUrlPath(
                  quizId,
                  attemptId,
                  q.questionId,
                  o.id,
                )}
                imageThumbnail
              />
            )}
            {o.isCorrect && <span className="ml-auto text-xs font-semibold">Correct</span>}
          </li>
        ))}
      </ul>
    )
  }

  if (q.type === 'ESSAY') {
    const text = answer?.text as string | undefined
    return (
      <p className="rounded-md border bg-muted/40 px-2.5 py-2 text-sm whitespace-pre-wrap">
        {text ? <MathText text={text} /> : <span className="text-muted-foreground">No answer.</span>}
      </p>
    )
  }
  if (q.type === 'FILE_UPLOAD') {
    return q.fileKey ? (
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={downloading}>
          <Download />
          {downloading ? 'Fetching link…' : 'Download file'}
        </Button>
        {downloadError && <p className="mt-1 text-xs text-destructive">{downloadError}</p>}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No file uploaded.</p>
    )
  }
  if (q.type === 'NUMERIC') {
    return <p className="text-sm">{answer?.value != null ? String(answer.value) : '—'}</p>
  }
  if (q.type === 'SHORT_TEXT') {
    const text = answer?.text as string | undefined
    return <p className="text-sm">{text ? <MathText text={text} /> : '—'}</p>
  }
  if (q.type === 'MATCHING') {
    const selections = (answer?.selections as { left: string; right: string }[]) ?? []
    return selections.length ? (
      <ul className="space-y-0.5 text-sm">
        {selections.map((s, i) => (
          <li key={i}>
            <MathText text={s.left} /> → <MathText text={s.right} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">No answer.</p>
    )
  }
  if (q.type === 'FILL_BLANK') {
    const answers = (answer?.answers as string[]) ?? []
    return answers.length ? (
      <p className="text-sm">
        <MathText text={answers.join(', ')} />
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">No answer.</p>
    )
  }
  return <p className="text-sm text-muted-foreground">No answer.</p>
}

function QuestionOverrideRow({
  quizId,
  attemptId,
  q,
}: {
  quizId: string
  attemptId: string
  q: AttemptDetailQuestion
}) {
  const queryClient = useQueryClient()
  const maxPoints = Number(q.points)
  const [points, setPoints] = useState(q.awardedPoints ?? '')
  const [feedback, setFeedback] = useState(q.feedback ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPoints(q.awardedPoints ?? '')
    setFeedback(q.feedback ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.awardedPoints, q.feedback])

  const gradeMutation = useMutation({
    mutationFn: () =>
      practiceGradingApi.grade(q.responseId!, {
        awardedPoints: Number(points),
        feedback: feedback || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-attempt-detail', quizId, attemptId] })
      queryClient.invalidateQueries({ queryKey: ['practice-quiz-results', quizId] })
      queryClient.invalidateQueries({ queryKey: ['practice-quiz-activity', quizId] })
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not save override'),
  })

  const dirty = points !== (q.awardedPoints ?? '') || feedback !== (q.feedback ?? '')

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline">{q.type}</Badge>
        {q.difficulty && <DifficultyBadge difficulty={q.difficulty} />}
        <span className="text-xs text-muted-foreground">{q.points} pts max</span>
        {q.autoGraded && <span className="text-xs text-muted-foreground">· auto-graded</span>}
      </div>
      <p className="mb-2 text-sm font-medium">
        <MathText text={q.prompt} />
      </p>
      {q.attachmentFilename && (
        <div className="mb-3">
          <DocumentViewer
            mimeType={q.attachmentMimeType}
            filename={q.attachmentFilename}
            path={practiceQuizzesApi.attemptQuestionAttachmentUrlPath(
              quizId,
              attemptId,
              q.questionId,
            )}
          />
        </div>
      )}
      {q.imageFilename && (
        <div className="mb-3">
          <DocumentViewer
            mimeType={q.imageMimeType}
            filename={q.imageFilename}
            path={practiceQuizzesApi.attemptQuestionImageUrlPath(quizId, attemptId, q.questionId)}
          />
        </div>
      )}
      <div className="mb-3">
        <AnswerPreview quizId={quizId} attemptId={attemptId} q={q} />
      </div>
      {q.responseId && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24 space-y-1">
            <Label htmlFor={`override-points-${q.questionId}`}>Points</Label>
            <Input
              id={`override-points-${q.questionId}`}
              type="number"
              min="0"
              max={maxPoints}
              step="0.5"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label htmlFor={`override-feedback-${q.questionId}`}>Feedback</Label>
            <Textarea
              id={`override-feedback-${q.questionId}`}
              className="min-h-8"
              rows={1}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || points === '' || gradeMutation.isPending}
            onClick={() => gradeMutation.mutate()}
          >
            {gradeMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function ReleaseSessionControl({ quizId, attemptId }: { quizId: string; attemptId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const releaseMutation = useMutation({
    mutationFn: () => practiceQuizzesApi.releaseSession(quizId, attemptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-attempt-detail', quizId, attemptId] })
      queryClient.invalidateQueries({ queryKey: ['practice-quiz-results', quizId] })
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not release session'),
  })

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => releaseMutation.mutate()}
        disabled={releaseMutation.isPending}
      >
        {releaseMutation.isPending ? 'Releasing…' : 'Release session'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function AttemptDetailDialog({
  quizId,
  attemptId,
  onOpenChange,
}: {
  quizId: string
  attemptId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['practice-attempt-detail', quizId, attemptId],
    queryFn: () => practiceQuizzesApi.attemptDetail(quizId, attemptId!),
    enabled: !!attemptId,
  })

  return (
    <Dialog open={attemptId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {isLoading || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {data.studentName} — attempt #{data.attemptNumber}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AttemptStatusBadge status={data.status} />
                <span>
                  {data.score ?? '—'}/{data.maxScore ?? '—'} pts
                </span>
                {data.submittedAt && <span>· submitted {formatDateTime(data.submittedAt)}</span>}
              </div>
            </DialogHeader>
            {data.status === 'IN_PROGRESS' ? (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    This attempt hasn't been submitted yet, so it can't be graded or overridden.
                    {data.sessionActive
                      ? ' A device currently has it open.'
                      : " No device currently has it open — the student's browser may have crashed or lost connection."}
                  </span>
                  {data.sessionActive && (
                    <ReleaseSessionControl quizId={quizId} attemptId={data.attemptId} />
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-5">
                {QUIZ_MODULE_SEQUENCE.map((module) => {
                  const moduleQuestions = data.questions.filter((q) => q.module === module)
                  if (moduleQuestions.length === 0) return null
                  const modulePoints = moduleQuestions.reduce(
                    (sum, q) => sum + Number(q.awardedPoints ?? 0),
                    0,
                  )
                  const moduleMaxPoints = moduleQuestions.reduce((sum, q) => sum + Number(q.points), 0)
                  return (
                    <div key={module} className="space-y-3">
                      <div className="flex items-baseline justify-between border-b pb-1">
                        <h3 className="text-sm font-semibold text-gray-800">
                          {QUIZ_MODULE_LABELS[module]}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          {modulePoints}/{moduleMaxPoints} pts
                        </span>
                      </div>
                      {moduleQuestions.map((q) => (
                        <QuestionOverrideRow
                          key={q.questionId}
                          quizId={quizId}
                          attemptId={data.attemptId}
                          q={q}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
