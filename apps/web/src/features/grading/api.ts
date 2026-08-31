import { apiGet, apiPost } from '../../lib/api-client'
import type { GradeResponseInput, GradingQueueItem, RegradeResult } from './types'

export const gradingApi = {
  queue: (quizId: string) =>
    apiGet<GradingQueueItem[]>(`/quizzes/${quizId}/grading-queue`),
  grade: (responseId: string, data: GradeResponseInput) =>
    apiPost(`/responses/${responseId}/grade`, data),
  getDownloadUrl: (responseId: string) =>
    apiGet<{ downloadUrl: string }>(`/responses/${responseId}/download-url`),
  regradeQuestion: (quizId: string, questionId: string) =>
    apiPost<RegradeResult>(`/quizzes/${quizId}/questions/${questionId}/regrade`),
  regradeQuiz: (quizId: string) =>
    apiPost<RegradeResult & { regradedQuestions: number }>(`/quizzes/${quizId}/regrade`),
}
