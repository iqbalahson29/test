import { apiGet, apiPost } from '../../lib/api-client'
import type { GradeResponseInput, GradingQueueItem } from './types'

export const gradingApi = {
  queue: (quizId: string) =>
    apiGet<GradingQueueItem[]>(`/quizzes/${quizId}/grading-queue`),
  grade: (responseId: string, data: GradeResponseInput) =>
    apiPost(`/responses/${responseId}/grade`, data),
  getDownloadUrl: (responseId: string) =>
    apiGet<{ downloadUrl: string }>(`/responses/${responseId}/download-url`),
}
