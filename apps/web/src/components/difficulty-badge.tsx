import type { QuestionDifficulty } from '@quiz-platform/shared'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
}

const DIFFICULTY_STYLES: Record<QuestionDifficulty, string> = {
  EASY: 'bg-emerald-50 text-emerald-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  HARD: 'bg-red-50 text-red-700',
}

export function DifficultyBadge({ difficulty }: { difficulty: QuestionDifficulty }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent font-medium', DIFFICULTY_STYLES[difficulty])}>
      {DIFFICULTY_LABELS[difficulty]}
    </Badge>
  )
}
