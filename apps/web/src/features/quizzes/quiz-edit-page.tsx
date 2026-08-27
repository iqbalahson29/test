import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { BarChart3, ClipboardCheck, Plus } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { AssignmentPanel } from '../assignments/assignment-panel'
import { quizzesApi, questionsApi } from './api'
import { QuestionForm } from './question-editor/question-form'
import { QuestionList } from './question-list'
import { StatusBadge } from './status-badge'
import type {
  CreateQuestionInput,
  QuestionDetail,
  QuestionFormValue,
  QuizStatus,
} from './types'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

function fromQuestionDetail(q: QuestionDetail): QuestionFormValue {
  return {
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    config: q.config,
    options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
  }
}

function toCreateInput(value: QuestionFormValue): CreateQuestionInput {
  return {
    type: value.type,
    prompt: value.prompt,
    points: Number(value.points),
    config: value.config,
    options: value.options.length > 0 ? value.options : undefined,
  }
}

export function QuizEditPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizzesApi.get(id!),
    enabled: !!id,
  })

  const [editingQuestion, setEditingQuestion] = useState<QuestionDetail | 'new' | null>(
    null,
  )
  const [statusError, setStatusError] = useState<string | null>(null)
  const [questionError, setQuestionError] = useState<string | null>(null)

  const invalidateQuiz = () => queryClient.invalidateQueries({ queryKey: ['quiz', id] })

  const statusMutation = useMutation({
    mutationFn: (status: QuizStatus) => quizzesApi.updateStatus(id!, status),
    onSuccess: () => {
      invalidateQuiz()
      setStatusError(null)
    },
    onError: (err: unknown) =>
      setStatusError(err instanceof ApiError ? err.message : 'Could not update status'),
  })

  const createQuestionMutation = useMutation({
    mutationFn: (value: QuestionFormValue) => questionsApi.create(id!, toCreateInput(value)),
    onSuccess: () => {
      invalidateQuiz()
      setEditingQuestion(null)
      setQuestionError(null)
    },
    onError: (err: unknown) =>
      setQuestionError(err instanceof ApiError ? err.message : 'Could not save question'),
  })

  const updateQuestionMutation = useMutation({
    mutationFn: ({
      questionId,
      value,
    }: {
      questionId: string
      value: QuestionFormValue
    }) => questionsApi.update(id!, questionId, toCreateInput(value)),
    onSuccess: () => {
      invalidateQuiz()
      setEditingQuestion(null)
      setQuestionError(null)
    },
    onError: (err: unknown) =>
      setQuestionError(err instanceof ApiError ? err.message : 'Could not save question'),
  })

  if (isLoading || !quiz) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const isDraft = quiz.status === 'DRAFT'

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">{quiz.title}</h1>
          {quiz.description && (
            <p className="mt-1 text-sm text-muted-foreground">{quiz.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            to={`/teacher/quizzes/${quiz.id}/analytics`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <BarChart3 className="size-4" />
            Analytics
          </Link>
          <Link
            to={`/teacher/quizzes/${quiz.id}/grading`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ClipboardCheck className="size-4" />
            Grading queue
          </Link>
          <StatusBadge status={quiz.status} />
        </div>
      </div>

      <div className="mb-2 flex gap-2">
        {quiz.status === 'DRAFT' && (
          <Button
            type="button"
            onClick={() => statusMutation.mutate('PUBLISHED')}
            disabled={statusMutation.isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {statusMutation.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        )}
        {quiz.status === 'PUBLISHED' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => statusMutation.mutate('DRAFT')}
              disabled={statusMutation.isPending}
            >
              Unpublish
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => statusMutation.mutate('ARCHIVED')}
              disabled={statusMutation.isPending}
            >
              Archive
            </Button>
          </>
        )}
      </div>
      {statusError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      )}
      {!isDraft && (
        <p className="mb-4 text-sm text-muted-foreground">
          Unpublish this quiz to add, edit, or reorder questions.
        </p>
      )}

      {quiz.status === 'PUBLISHED' && <AssignmentPanel quizId={quiz.id} />}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[12.5px] font-bold text-gray-800">
          Questions ({quiz.questions.length})
        </h2>
        {isDraft && editingQuestion === null && (
          <Button type="button" size="sm" onClick={() => setEditingQuestion('new')}>
            <Plus />
            Add question
          </Button>
        )}
      </div>

      {questionError && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{questionError}</AlertDescription>
        </Alert>
      )}

      {editingQuestion !== null && (
        <div className="mb-4">
          <QuestionForm
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
        editable={isDraft}
        onEdit={(q) => setEditingQuestion(q)}
      />
    </div>
  )
}
