import type { QuestionType } from '@quiz-platform/shared'

export type QuizStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'

export interface QuizSummary {
  id: string
  title: string
  status: QuizStatus
  questionCount: number
  attemptCount: number
  averageScorePercent: number | null
  availableFrom: string | null
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
  attachmentKey: string | null
  attachmentFilename: string | null
  attachmentMimeType: string | null
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
  createdByName: string
  attemptCount: number
  averageScorePercent: number | null
}

export interface ActivityEntry {
  id: string
  action: string
  message: string
  createdAt: string
}

export type ResultStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'

export interface ResultRow {
  attemptId: string
  studentName: string
  studentEmail: string
  attemptNumber: number
  status: ResultStatus
  score: string | null
  maxScore: string | null
  percent: number | null
  startedAt: string
  submittedAt: string | null
  /** True while a device is actively holding this attempt's single-session
   * lock (heartbeating within the last ~90s). Only meaningful when status
   * is IN_PROGRESS. */
  sessionActive: boolean
}

export interface AttemptDetailQuestion {
  questionId: string
  type: QuestionType
  prompt: string
  points: string
  options: { id: string; text: string; isCorrect: boolean }[]
  responseId: string | null
  answer: Record<string, unknown> | null
  fileKey: string | null
  awardedPoints: string | null
  feedback: string | null
  autoGraded: boolean
}

export interface AttemptDetail {
  attemptId: string
  studentName: string
  studentEmail: string
  attemptNumber: number
  status: ResultStatus
  score: string | null
  maxScore: string | null
  startedAt: string
  submittedAt: string | null
  sessionActive: boolean
  questions: AttemptDetailQuestion[]
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
  /** Present when editing an existing option, so the backend can update it
   * in place instead of recreating it with a new id (which would orphan
   * any student answer already referencing it). Omit for a new option. */
  id?: string
  text: string
  isCorrect: boolean
}

export interface CreateQuestionInput {
  type: QuestionType
  prompt: string
  points: number
  config: Record<string, unknown>
  options?: OptionInput[]
  /** From questionsApi.getAttachmentUploadUrl, after PUTting the file to S3. */
  attachmentKey?: string
  attachmentFilename?: string
  attachmentMimeType?: string
}

/** Form-local shape — `points` stays a string while being edited. */
export interface QuestionFormValue {
  type: QuestionType
  prompt: string
  points: string
  config: Record<string, unknown>
  options: OptionInput[]
  attachment: QuestionAttachment | null
}

/**
 * `key`/`mimeType` are set once a file has been picked and uploaded (or
 * already existed on the question being edited); `file` is kept only for a
 * freshly-picked attachment so the editor can preview it locally without a
 * round trip before the question is saved.
 */
export interface QuestionAttachment {
  key: string
  filename: string
  mimeType: string
  file?: File
}
