import type { QuestionType } from '@quiz-platform/shared'

export interface GradingQueueItem {
  responseId: string
  attemptId: string
  studentName: string
  questionId: string
  questionType: QuestionType
  questionPrompt: string
  points: string
  answer: { text?: string } | null
  fileKey: string | null
}

export interface GradeResponseInput {
  awardedPoints: number
  feedback?: string
}

export interface RegradeResult {
  regradedResponses: number
  affectedAttempts: number
}
