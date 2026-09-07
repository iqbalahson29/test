import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api-client'
import { AssignmentPanel } from '../../assignments/assignment-panel'
import { quizzesApi } from '../api'
import type { QuizDetail, QuizStatus } from '../types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function QuizAssignTab({ quiz }: { quiz: QuizDetail }) {
  const queryClient = useQueryClient()
  const [statusError, setStatusError] = useState<string | null>(null)
  const [availableFromInput, setAvailableFromInput] = useState('')

  useEffect(() => {
    setAvailableFromInput(toDatetimeLocalValue(quiz.availableFrom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id, quiz.availableFrom])

  const invalidateQuiz = () => {
    queryClient.invalidateQueries({ queryKey: ['quiz', quiz.id] })
    queryClient.invalidateQueries({ queryKey: ['quizzes'] })
    queryClient.invalidateQueries({ queryKey: ['quiz-activity', quiz.id] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: QuizStatus) => quizzesApi.updateStatus(quiz.id, status),
    onSuccess: () => {
      invalidateQuiz()
      setStatusError(null)
    },
    onError: (err: unknown) =>
      setStatusError(err instanceof ApiError ? err.message : 'Could not update status'),
  })

  const scheduleMutation = useMutation({
    mutationFn: async (iso: string) => {
      await quizzesApi.update(quiz.id, { availableFrom: iso })
      return quizzesApi.updateStatus(quiz.id, 'SCHEDULED')
    },
    onSuccess: () => {
      invalidateQuiz()
      setStatusError(null)
    },
    onError: (err: unknown) =>
      setStatusError(err instanceof ApiError ? err.message : 'Could not schedule quiz'),
  })

  return (
    <div className="space-y-4">
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle>Publish &amp; schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusError && (
            <Alert variant="destructive">
              <AlertDescription>{statusError}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-end gap-2">
            {quiz.status === 'DRAFT' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="availableFrom">Available from (optional)</Label>
                  <Input
                    id="availableFrom"
                    type="datetime-local"
                    value={availableFromInput}
                    onChange={(e) => setAvailableFromInput(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => statusMutation.mutate('PUBLISHED')}
                  disabled={statusMutation.isPending || scheduleMutation.isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {statusMutation.isPending ? 'Publishing…' : 'Publish now'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => scheduleMutation.mutate(new Date(availableFromInput).toISOString())}
                  disabled={
                    !availableFromInput ||
                    new Date(availableFromInput).getTime() <= Date.now() ||
                    statusMutation.isPending ||
                    scheduleMutation.isPending
                  }
                >
                  {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule'}
                </Button>
              </>
            )}
            {quiz.status === 'SCHEDULED' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Scheduled to go live{' '}
                  {quiz.availableFrom &&
                    new Date(quiz.availableFrom).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                </p>
                <Button
                  type="button"
                  onClick={() => statusMutation.mutate('PUBLISHED')}
                  disabled={statusMutation.isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Publish now
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => statusMutation.mutate('DRAFT')}
                  disabled={statusMutation.isPending}
                >
                  Unschedule
                </Button>
              </>
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
            {quiz.status === 'ARCHIVED' && (
              <>
                <p className="text-sm text-muted-foreground">This quiz is archived.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => statusMutation.mutate('DRAFT')}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? 'Restoring…' : 'Restore quiz'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {quiz.status === 'PUBLISHED' ? (
        <AssignmentPanel quizId={quiz.id} quizTitle={quiz.title} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Publish this quiz to assign it to students or groups.
        </p>
      )}
    </div>
  )
}
