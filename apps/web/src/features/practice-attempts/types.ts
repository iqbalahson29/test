import type { QuestionDifficulty, QuestionType, QuizModule } from '@quiz-platform/shared'

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'

export interface SanitizedOption {
  id: string
  text: string
  order: number
  imageFilename: string | null
  imageMimeType: string | null
}

export interface AttemptQuestion {
  id: string
  module: QuizModule
  type: QuestionType
  prompt: string
  points: string
  order: number
  config: Record<string, unknown>
  /** Only present when the quiz's "show difficulty to students" setting is on. */
  difficulty: QuestionDifficulty | null
  options: SanitizedOption[]
  answer: unknown
  fileKey: string | null
  awardedPoints: string | null
  feedback: string | null
  attachmentFilename: string | null
  attachmentMimeType: string | null
  imageFilename: string | null
  imageMimeType: string | null
}

export interface AttemptDetail {
  id: string
  quizId: string
  quizTitle: string
  /** Null once every module is complete (attempt SUBMITTED/GRADED) — at that
   * point `questions` holds every answered question for review instead of
   * just the active module's. */
  currentModule: QuizModule | null
  /** Absolute deadline for the current module, or null when there is none. */
  moduleDeadlineAt: string | null
  completedModules: QuizModule[]
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
