import { apiGet, apiPost } from '../../lib/api-client'
import type { GradeResponseInput, GradingQueueItem, RegradeResult } from './types'

export const practiceGradingApi = {
  queue: (quizId: string) =>
    apiGet<GradingQueueItem[]>(`/practice-quizzes/${quizId}/grading-queue`),
  grade: (responseId: string, data: GradeResponseInput) =>
    apiPost(`/practice-responses/${responseId}/grade`, data),
  getDownloadUrl: (responseId: string) =>
    apiGet<{ downloadUrl: string }>(`/practice-responses/${responseId}/download-url`),
  regradeQuestion: (quizId: string, questionId: string) =>
    apiPost<RegradeResult>(`/practice-quizzes/${quizId}/questions/${questionId}/regrade`),
  regradeQuiz: (quizId: string) =>
    apiPost<RegradeResult & { regradedQuestions: number }>(`/practice-quizzes/${quizId}/regrade`),
}
