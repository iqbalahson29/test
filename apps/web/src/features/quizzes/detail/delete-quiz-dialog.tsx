import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { assignmentsApi } from '../../assignments/api'
import type { QuizDetail } from '../types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function DeleteQuizDialog({
  quiz,
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: {
  quiz: QuizDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
  error: string | null
}) {
  const { data: summary } = useQuery({
    queryKey: ['assignment-summary', quiz.id],
    queryFn: () => assignmentsApi.summary(quiz.id),
    enabled: open,
  })

  const assignedCount = summary?.assignedStudents.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4" />
          </div>
          <DialogTitle>Delete "{quiz.title}"?</DialogTitle>
          <DialogDescription>
            This permanently deletes the quiz, all {quiz.questions.length}{' '}
            question{quiz.questions.length === 1 ? '' : 's'},{' '}
            {quiz.attemptCount} student attempt{quiz.attemptCount === 1 ? '' : 's'}{' '}
            and their grades, and {assignedCount} assignment{assignedCount === 1 ? '' : 's'}
            . This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Deleting…' : 'Delete quiz'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
