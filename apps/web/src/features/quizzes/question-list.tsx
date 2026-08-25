import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { questionsApi } from './api'
import type { QuestionDetail } from './types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

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

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
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
              </div>
              <p className="mt-1 truncate text-sm">{q.prompt}</p>
            </div>
            {editable && (
              <div className="flex shrink-0 items-center gap-1">
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
                <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(q)} aria-label="Edit">
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(q.id)}
                  disabled={deleteMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
