import type { QuestionDifficulty, QuestionType, QuizModule } from '@quiz-platform/shared'

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
  imageKey: string | null
  imageFilename: string | null
  imageMimeType: string | null
}

export interface QuestionDetail {
  id: string
  quizId: string
  module: QuizModule
  type: QuestionType
  prompt: string
  points: string // Prisma Decimal serializes to JSON as a string
  order: number
  config: Record<string, unknown>
  difficulty: QuestionDifficulty | null
  createdAt: string
  updatedAt: string
  options: QuestionOption[]
  attachmentKey: string | null
  attachmentFilename: string | null
  attachmentMimeType: string | null
  imageKey: string | null
  imageFilename: string | null
  imageMimeType: string | null
}

export interface QuizDetail {
  id: string
  tenantId: string
  title: string
  description: string | null
  maxAttempts: number | null
  shuffleQuestions: boolean
  shuffleOptions: boolean
  showDifficultyToStudents: boolean
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
  module: QuizModule
  type: QuestionType
  prompt: string
  points: string
  difficulty: QuestionDifficulty | null
  options: {
    id: string
    text: string
    isCorrect: boolean
    imageFilename: string | null
    imageMimeType: string | null
  }[]
  attachmentFilename: string | null
  attachmentMimeType: string | null
  imageFilename: string | null
  imageMimeType: string | null
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
  maxAttempts?: number
  shuffleQuestions?: boolean
  shuffleOptions?: boolean
  showDifficultyToStudents?: boolean
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
  /** Same tri-state convention as CreateQuestionInput's image* fields, for
   * this option's own image. */
  imageKey?: string
  imageFilename?: string
  imageMimeType?: string
  /** A just-picked, not-yet-uploaded image file — previewed locally. */
  imageFile?: File
}

export interface CreateQuestionInput {
  type: QuestionType
  module: QuizModule
  prompt: string
  points: number
  config: Record<string, unknown>
  /** Optional — undefined leaves it untouched on update, null clears it. */
  difficulty?: QuestionDifficulty | null
  options?: OptionInput[]
  /** From questionsApi.getAttachmentUploadUrl, after PUTting the file to S3. */
  attachmentKey?: string
  attachmentFilename?: string
  attachmentMimeType?: string
  /** Same tri-state convention as attachment*, for the question's image. */
  imageKey?: string
  imageFilename?: string
  imageMimeType?: string
}

/** Form-local shape — `points` stays a string while being edited. */
export interface QuestionFormValue {
  type: QuestionType
  module: QuizModule
  prompt: string
  points: string
  config: Record<string, unknown>
  difficulty: QuestionDifficulty | null
  options: OptionInput[]
  attachment: QuestionAttachment | null
  image: QuestionImage | null
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

/** Same shape as QuestionAttachment, for the question's inline image —
 * kept as a separate type since it's a distinct field, not a reference doc. */
export interface QuestionImage {
  key: string
  filename: string
  mimeType: string
  file?: File
}
