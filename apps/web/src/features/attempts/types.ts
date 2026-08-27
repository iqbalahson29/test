import type { QuestionType } from '@quiz-platform/shared'

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'

export interface SanitizedOption {
  id: string
  text: string
  order: number
}

export interface AttemptQuestion {
  id: string
  type: QuestionType
  prompt: string
  points: string
  order: number
  config: Record<string, unknown>
  options: SanitizedOption[]
  answer: unknown
  fileKey: string | null
  awardedPoints: string | null
  feedback: string | null
}

export interface AttemptDetail {
  id: string
  quizId: string
  quizTitle: string
  timeLimitSec: number | null
  status: AttemptStatus
  attemptNumber: number
  maxAttempts: number | null
  attemptsRemaining: number | null
  startedAt: string
  submittedAt: string | null
  score: string | null
  maxScore: string | null
  questions: AttemptQuestion[]
}
