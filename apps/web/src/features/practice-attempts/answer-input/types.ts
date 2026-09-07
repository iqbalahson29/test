import type { AttemptQuestion } from '../types'

export interface AnswerInputProps {
  question: AttemptQuestion
  value: unknown
  onChange: (answer: unknown) => void
  readOnly: boolean
  /** Only used by the FILE_UPLOAD input — needed to request an upload URL. */
  attemptId: string
}
