import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, Eye, Paperclip, Pencil } from 'lucide-react'
import { AUTO_GRADABLE_TYPES } from '@quiz-platform/shared'
import { ApiError } from '../../lib/api-client'
import { questionsApi } from './api'
import { QuestionDetailDialog } from './detail/question-detail-dialog'
import { QuestionRowMenu } from './detail/question-row-menu'
import { useQuestionActions } from './detail/use-question-actions'
import type { QuestionDetail } from './types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ConfirmKind = 'view' | 'edit' | 'duplicate' | 'regrade' | 'delete'

const CONFIRM_COPY: Record<
  ConfirmKind,
  { title: string; description: (prompt: string) => string; confirmLabel: string; destructive: boolean }
> = {
  view: {
    title: 'View this question?',
    description: (prompt) => `Open a read-only preview of "${prompt}".`,
    confirmLabel: 'View',
    destructive: false,
  },
  edit: {
    title: 'Edit this question?',
    description: () => 'Switch this question into edit mode.',
    confirmLabel: 'Edit',
    destructive: false,
  },
  duplicate: {
    title: 'Duplicate this question?',
    description: (prompt) => `Creates a copy of "${prompt}" at the end of this quiz.`,
    confirmLabel: 'Duplicate',
    destructive: false,
  },
  regrade: {
    title: 'Regrade this question?',
    description: (prompt) =>
      `Recalculates scores for already-graded attempts on "${prompt}". This can change student grades.`,
    confirmLabel: 'Regrade',
    destructive: true,
  },
  delete: {
    title: 'Delete this question?',
    description: (prompt) =>
      `This permanently removes "${prompt}" and its answer options. This can't be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  },
}

export function QuestionList({
  quizId,
  questions,
  editable,
  onEdit,
}: {
  quizId: string
  questions: QuestionDetail[]
  editable: boolean
  onEdit: (question: QuestionDetail) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<QuestionDetail | null>(null)
  const [confirmAction, setConfirmActionState] = useState<
    { kind: ConfirmKind; question: QuestionDetail } | null
  >(null)
  const setConfirmAction = (action: { kind: ConfirmKind; question: QuestionDetail } | null) => {
    setError(null)
    setConfirmActionState(action)
  }
  const actions = useQuestionActions(quizId)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['quiz', quizId] })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => questionsApi.reorder(quizId, orderedIds),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not reorder'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => questionsApi.remove(quizId, id),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not delete question'),
  })

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= questions.length) return
    const ids = questions.map((q) => q.id)
    const tmp = ids[index]
    ids[index] = ids[target]
    ids[target] = tmp
    reorderMutation.mutate(ids)
  }

  const runConfirmedAction = () => {
    if (!confirmAction) return
    const { kind, question } = confirmAction
    switch (kind) {
      case 'view':
        setViewing(question)
        setConfirmAction(null)
        break
      case 'edit':
        onEdit(question)
        setConfirmAction(null)
        break
      case 'duplicate':
        actions.duplicate.mutate(question.id, { onSuccess: () => setConfirmAction(null) })
        break
      case 'regrade':
        actions.regradeQuestion.mutate(question.id, { onSuccess: () => setConfirmAction(null) })
        break
      case 'delete':
        deleteMutation.mutate(question.id, { onSuccess: () => setConfirmAction(null) })
        break
    }
  }

  const confirmPending =
    (confirmAction?.kind === 'duplicate' && actions.duplicate.isPending) ||
    (confirmAction?.kind === 'regrade' && actions.regradeQuestion.isPending) ||
    (confirmAction?.kind === 'delete' && deleteMutation.isPending)

  return (
    <div className="space-y-2">
      {(error || actions.error) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? actions.error}</AlertDescription>
        </Alert>
      )}
      {actions.message && (
        <Alert>
          <AlertDescription>{actions.message}</AlertDescription>
        </Alert>
      )}
      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      )}
      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{q.type}</Badge>
                <span className="text-sm text-muted-foreground">{q.points} pts</span>
                {q.attachmentKey && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Paperclip className="size-3" />
                    {q.attachmentFilename}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm">{q.prompt}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {editable && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(i, 1)}
                    disabled={i === questions.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
              <QuestionRowMenu
                question={q}
                editable={editable}
                onView={() => setConfirmAction({ kind: 'view', question: q })}
                onEdit={() => setConfirmAction({ kind: 'edit', question: q })}
                onDuplicate={() => setConfirmAction({ kind: 'duplicate', question: q })}
                onRegrade={
                  (AUTO_GRADABLE_TYPES as string[]).includes(q.type)
                    ? () => setConfirmAction({ kind: 'regrade', question: q })
                    : undefined
                }
                onDelete={() => setConfirmAction({ kind: 'delete', question: q })}
                disabled={
                  deleteMutation.isPending ||
                  actions.duplicate.isPending ||
                  actions.regradeQuestion.isPending
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
      <QuestionDetailDialog
        quizId={quizId}
        question={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          {confirmAction &&
            (() => {
              const copy = CONFIRM_COPY[confirmAction.kind]
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
                      {confirmAction.kind === 'view' ? (
                        <Eye className="size-4" />
                      ) : confirmAction.kind === 'edit' ? (
                        <Pencil className="size-4" />
                      ) : (
                        <AlertTriangle className="size-4" />
                      )}
                    </div>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>
                      {copy.description(confirmAction.question.prompt)}
                    </DialogDescription>
                  </DialogHeader>
                  {(error || actions.error) && (
                    <Alert variant="destructive">
                      <AlertDescription>{error ?? actions.error}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant={copy.destructive ? 'destructive' : 'default'}
                      disabled={confirmPending}
                      onClick={runConfirmedAction}
                    >
                      {confirmPending ? 'Working…' : copy.confirmLabel}
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
