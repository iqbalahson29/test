import { apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type { AttemptDetail } from './types'

interface UploadUrlResponse {
  uploadUrl: string
  fileKey: string
}

export const practiceAttemptsApi = {
  start: (quizId: string) => apiPost<AttemptDetail>('/practice-attempts', { quizId }),
  get: (id: string) => apiGet<AttemptDetail>(`/practice-attempts/${id}`),
  saveResponse: (
    id: string,
    questionId: string,
    data: { answer?: unknown; fileKey?: string },
  ) => apiPatch<{ ok: true }>(`/practice-attempts/${id}/responses/${questionId}`, data),
  completeCurrentModule: (id: string) => apiPost<AttemptDetail>(`/practice-attempts/${id}/modules/complete`),
  beginNextModule: (id: string) => apiPost<AttemptDetail>(`/practice-attempts/${id}/modules/begin-next`),
  heartbeat: (id: string) => apiPost<{ ok: true }>(`/practice-attempts/${id}/heartbeat`),
  getUploadUrl: (
    attemptId: string,
    questionId: string,
    filename: string,
    contentType: string,
  ) =>
    apiPost<UploadUrlResponse>(
      `/practice-attempts/${attemptId}/responses/${questionId}/upload-url`,
      { filename, contentType },
    ),
}
