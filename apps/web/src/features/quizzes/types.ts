import type { QuestionType } from '@quiz-platform/shared'

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export interface QuizSummary {
  id: string
  title: string
  status: QuizStatus
  questionCount: number
  createdAt: string
  updatedAt: string
}

export interface QuestionOption {
  id: string
  questionId: string
  text: string
  isCorrect: boolean
  order: number
}

export interface QuestionDetail {
  id: string
  quizId: string
  type: QuestionType
  prompt: string
  points: string // Prisma Decimal serializes to JSON as a string
  order: number
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
  options: QuestionOption[]
}

export interface QuizDetail {
  id: string
  tenantId: string
  title: string
  description: string | null
  timeLimitSec: number | null
  maxAttempts: number | null
  shuffleQuestions: boolean
  shuffleOptions: boolean
  availableFrom: string | null
  availableUntil: string | null
  passMarkPercent: string | null
  status: QuizStatus
  createdAt: string
  updatedAt: string
  questions: QuestionDetail[]
}

export interface CreateQuizInput {
  title: string
  description?: string
  timeLimitSec?: number
  maxAttempts?: number
  shuffleQuestions?: boolean
  shuffleOptions?: boolean
  availableFrom?: string
  availableUntil?: string
  passMarkPercent?: number
}

export interface OptionInput {
  text: string
  isCorrect: boolean
}

export interface CreateQuestionInput {
  type: QuestionType
  prompt: string
  points: number
  config: Record<string, unknown>
  options?: OptionInput[]
}

/** Form-local shape — `points` stays a string while being edited. */
export interface QuestionFormValue {
  type: QuestionType
  prompt: string
  points: string
  config: Record<string, unknown>
  options: OptionInput[]
}
