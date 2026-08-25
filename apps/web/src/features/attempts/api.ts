import { apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type { AttemptDetail } from './types'

interface UploadUrlResponse {
  uploadUrl: string
  fileKey: string
}

export const attemptsApi = {
  start: (quizId: string) => apiPost<AttemptDetail>('/attempts', { quizId }),
  get: (id: string) => apiGet<AttemptDetail>(`/attempts/${id}`),
  saveResponse: (
    id: string,
    questionId: string,
    data: { answer?: unknown; fileKey?: string },
  ) => apiPatch<{ ok: true }>(`/attempts/${id}/responses/${questionId}`, data),
  submit: (id: string) => apiPost<AttemptDetail>(`/attempts/${id}/submit`),
  getUploadUrl: (
    attemptId: string,
    questionId: string,
    filename: string,
    contentType: string,
  ) =>
    apiPost<UploadUrlResponse>(
      `/attempts/${attemptId}/responses/${questionId}/upload-url`,
      { filename, contentType },
    ),
}
