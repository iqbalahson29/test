import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Eye, MoreHorizontal, Pencil } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { QuizAnalyticsPage } from '../analytics/quiz-analytics-page'
import { GradingQueuePage } from '../grading/grading-queue-page'
import { quizzesApi, questionsApi } from './api'
import { DeleteQuizDialog } from './detail/delete-quiz-dialog'
import { formatDate } from './detail/format'
import { QuizAssignTab } from './detail/quiz-assign-tab'
import { QuizOverviewTab } from './detail/quiz-overview-tab'
import { QuizResultsTab } from './detail/quiz-results-tab'
import { QuizSettingsTab } from './detail/quiz-settings-tab'
import { QUICK_ACTION_ITEMS } from './detail/quiz-quick-actions-items'
import { QUIZ_TABS } from './detail/tab-key'
import type { QuizTabKey } from './detail/tab-key'
import { useQuestionActions } from './detail/use-question-actions'
import { useQuizQuickActions } from './detail/use-quiz-quick-actions'
import { QuestionForm } from './question-editor/question-form'
import { QuestionList } from './question-list'
import { StatusBadge } from './status-badge'
import type { CreateQuestionInput, QuestionDetail, QuestionFormValue } from './types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type QuickActionKey = 'duplicate' | 'export' | 'archive' | 'restore'

function fromQuestionDetail(q: QuestionDetail): QuestionFormValue {
  return {
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    config: q.config,
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
    attachment: q.attachmentKey
      ? {
          key: q.attachmentKey,
          filename: q.attachmentFilename ?? 'document',
          mimeType: q.attachmentMimeType ?? '',
        }
      : null,
  }
}

function toCreateInput(value: QuestionFormValue): CreateQuestionInput {
  return {
    type: value.type,
    prompt: value.prompt,
    points: Number(value.points),
    config: value.config,
    options: value.options.length > 0 ? value.options : undefined,
    // An empty string clears the attachment server-side — harmless to send
    // when there was never one, and correctly clears one the user removed.
    attachmentKey: value.attachment?.key ?? '',
    attachmentFilename: value.attachment?.filename ?? '',
    attachmentMimeType: value.attachment?.mimeType ?? '',
  }
}

export function QuizEditPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as QuizTabKey) || 'overview'
  const setActiveTab = (tab: QuizTabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizzesApi.get(id!),
    enabled: !!id,
  })
  const { data: activity } = useQuery({
    queryKey: ['quiz-activity', id],
    queryFn: () => quizzesApi.activity(id!),
    enabled: !!id,
  })

  const [editingQuestion, setEditingQuestion] = useState<QuestionDetail | 'new' | null>(null)
  const [questionError, setQuestionError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [confirmActionKey, setConfirmActionKey] = useState<QuickActionKey | null>(null)
  const quizQuestionActions = useQuestionActions(id ?? '')

  const invalidateQuiz = () => queryClient.invalidateQueries({ queryKey: ['quiz', id] })

  const createQuestionMutation = useMutation({
    mutationFn: (value: QuestionFormValue) => questionsApi.create(id!, toCreateInput(value)),
    onSuccess: () => {
      invalidateQuiz()
      queryClient.invalidateQueries({ queryKey: ['quiz-activity', id] })
      setEditingQuestion(null)
      setQuestionError(null)
    },
    onError: (err: unknown) =>
      setQuestionError(err instanceof ApiError ? err.message : 'Could not save question'),
  })

  const updateQuestionMutation = useMutation({
    mutationFn: ({ questionId, value }: { questionId: string; value: QuestionFormValue }) =>
      questionsApi.update(id!, questionId, toCreateInput(value)),
    onSuccess: () => {
      invalidateQuiz()
      queryClient.invalidateQueries({ queryKey: ['quiz-activity', id] })
      setEditingQuestion(null)
      setQuestionError(null)
    },
    onError: (err: unknown) =>
      setQuestionError(err instanceof ApiError ? err.message : 'Could not save question'),
  })

  const quickActions = useQuizQuickActions(quiz)

  if (isLoading || !quiz) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const isDraft = quiz.status === 'DRAFT'
  const publishedEntry = activity?.find(
    (a) => a.action === 'STATUS_CHANGED' && a.message.startsWith('Published'),
  )

  const quickActionItems = QUICK_ACTION_ITEMS(quickActions, () => setDeleteDialogOpen(true))
  const quickActionByKey = Object.fromEntries(quickActionItems.map((item) => [item.key, item])) as Record<
    string,
    (typeof quickActionItems)[number]
  >

  const QUICK_ACTION_CONFIRM_COPY: Record<
    QuickActionKey,
    { title: string; description: string; confirmLabel: string; destructive: boolean }
  > = {
    duplicate: {
      title: 'Duplicate this quiz?',
      description: `Creates a copy of "${quiz.title}", including its questions, in Draft status.`,
      confirmLabel: quickActions.duplicate.isPending ? 'Duplicating…' : 'Duplicate',
      destructive: false,
    },
    export: {
      title: 'Export this quiz?',
      description: `Opens a printable PDF version of "${quiz.title}" in a new tab.`,
      confirmLabel: 'Export',
      destructive: false,
    },
    archive: {
      title: 'Archive this quiz?',
      description: `Removes "${quiz.title}" from active listings. You can restore it from here later.`,
      confirmLabel: quickActions.archive.isPending ? 'Archiving…' : 'Archive',
      destructive: true,
    },
    restore: {
      title: 'Restore this quiz?',
      description: `"${quiz.title}" returns to Draft. All existing attempts and scores are untouched and still there.`,
      confirmLabel: quickActions.restore.isPending ? 'Restoring…' : 'Restore',
      destructive: false,
    },
  }

  return (
    <div>
      <Link
        to="/teacher"
        className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to quizzes
      </Link>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">{quiz.title}</h1>
          {quiz.description && (
            <p className="mt-1 text-sm text-muted-foreground">{quiz.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={quickActions.previewQuiz}>
            <Eye />
            Preview quiz
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {quickActionItems.map((item) => (
                <div key={item.key}>
                  {item.destructive && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    variant={item.destructive ? 'destructive' : 'default'}
                    className="gap-2 px-2.5 py-2"
                    disabled={item.disabled}
                    onSelect={
                      item.key === 'delete'
                        ? item.onClick
                        : () => setConfirmActionKey(item.key as QuickActionKey)
                    }
                  >
                    <item.icon />
                    {item.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" onClick={() => setActiveTab('questions')}>
            <Pencil />
            Edit quiz
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-col items-end gap-1">
        <StatusBadge status={quiz.status} />
        {quiz.status === 'PUBLISHED' && publishedEntry && (
          <p className="text-[11px] text-gray-400">
            Published on {formatDate(publishedEntry.createdAt)}
          </p>
        )}
      </div>

      {quickActions.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{quickActions.error}</AlertDescription>
        </Alert>
      )}

      <div className="mb-6 flex items-center gap-5 overflow-x-auto border-b border-gray-200">
        {QUIZ_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              '-mb-px border-b-2 pb-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
              tab.key === activeTab
                ? 'border-primary-600 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <QuizOverviewTab
          quiz={quiz}
          quickActions={quickActions}
          onTabChange={setActiveTab}
          onEditQuestion={(q) => {
            setEditingQuestion(q)
            setActiveTab('questions')
          }}
          onAddQuestion={() => {
            setEditingQuestion('new')
            setActiveTab('questions')
          }}
          onDeleteQuizClick={() => setDeleteDialogOpen(true)}
        />
      )}

      {activeTab === 'questions' && (
        <div>
          {!isDraft && (
            <p className="mb-4 text-sm text-muted-foreground">
              Questions can still be added, edited, deleted, and reordered while this quiz is
              live — corrections apply going forward, and won't retroactively change already
              graded attempts unless you regrade.
            </p>
          )}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12.5px] font-bold text-gray-800">
              Questions ({quiz.questions.length})
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => quizQuestionActions.regradeQuiz.mutate()}
                disabled={quizQuestionActions.regradeQuiz.isPending || quiz.questions.length === 0}
              >
                {quizQuestionActions.regradeQuiz.isPending ? 'Regrading…' : 'Regrade quiz'}
              </Button>
              {editingQuestion === null && (
                <Button type="button" onClick={() => setEditingQuestion('new')}>
                  Add question
                </Button>
              )}
            </div>
          </div>

          {(questionError || quizQuestionActions.error) && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{questionError ?? quizQuestionActions.error}</AlertDescription>
            </Alert>
          )}
          {quizQuestionActions.message && (
            <Alert className="mb-3">
              <AlertDescription>{quizQuestionActions.message}</AlertDescription>
            </Alert>
          )}

          {editingQuestion !== null && (
            <div className="mb-4">
              <QuestionForm
                quizId={quiz.id}
                questionId={editingQuestion === 'new' ? undefined : editingQuestion.id}
                initial={editingQuestion === 'new' ? undefined : fromQuestionDetail(editingQuestion)}
                submitting={createQuestionMutation.isPending || updateQuestionMutation.isPending}
                onCancel={() => {
                  setEditingQuestion(null)
                  setQuestionError(null)
                }}
                onSubmit={(value) => {
                  if (editingQuestion === 'new') {
                    createQuestionMutation.mutate(value)
                  } else {
                    updateQuestionMutation.mutate({ questionId: editingQuestion.id, value })
                  }
                }}
              />
            </div>
          )}

          <QuestionList
            quizId={quiz.id}
            questions={quiz.questions}
            editable
            onEdit={(q) => setEditingQuestion(q)}
          />
        </div>
      )}

      {activeTab === 'settings' && <QuizSettingsTab quiz={quiz} />}
      {activeTab === 'assign' && <QuizAssignTab quiz={quiz} />}
      {activeTab === 'results' && <QuizResultsTab quizId={quiz.id} />}
      {activeTab === 'analytics' && <QuizAnalyticsPage />}
      {activeTab === 'grading' && <GradingQueuePage />}

      <DeleteQuizDialog
        quiz={quiz}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => quickActions.remove.mutate()}
        pending={quickActions.remove.isPending}
        error={quickActions.error}
      />

      <Dialog
        open={confirmActionKey !== null}
        onOpenChange={(open) => !open && setConfirmActionKey(null)}
      >
        <DialogContent className="sm:max-w-sm">
          {confirmActionKey && (
            <>
              <DialogHeader>
                <div
                  className={`flex size-9 items-center justify-center rounded-full ${
                    QUICK_ACTION_CONFIRM_COPY[confirmActionKey].destructive
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  <AlertTriangle className="size-4" />
                </div>
                <DialogTitle>{QUICK_ACTION_CONFIRM_COPY[confirmActionKey].title}</DialogTitle>
                <DialogDescription>
                  {QUICK_ACTION_CONFIRM_COPY[confirmActionKey].description}
                </DialogDescription>
              </DialogHeader>
              {quickActions.error && (
                <Alert variant="destructive">
                  <AlertDescription>{quickActions.error}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmActionKey(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={QUICK_ACTION_CONFIRM_COPY[confirmActionKey].destructive ? 'destructive' : 'default'}
                  disabled={quickActionByKey[confirmActionKey]?.disabled}
                  onClick={() => {
                    if (confirmActionKey === 'duplicate') {
                      quickActions.duplicate.mutate(undefined, {
                        onSuccess: () => setConfirmActionKey(null),
                      })
                    } else if (confirmActionKey === 'archive') {
                      quickActions.archive.mutate(undefined, {
                        onSuccess: () => setConfirmActionKey(null),
                      })
                    } else if (confirmActionKey === 'restore') {
                      quickActions.restore.mutate(undefined, {
                        onSuccess: () => setConfirmActionKey(null),
                      })
                    } else {
                      quickActions.exportPdf()
                      setConfirmActionKey(null)
                    }
                  }}
                >
                  {QUICK_ACTION_CONFIRM_COPY[confirmActionKey].confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
