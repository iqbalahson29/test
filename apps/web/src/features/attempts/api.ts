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
  completeCurrentModule: (id: string) => apiPost<AttemptDetail>(`/attempts/${id}/modules/complete`),
  beginNextModule: (id: string) => apiPost<AttemptDetail>(`/attempts/${id}/modules/begin-next`),
  heartbeat: (id: string) => apiPost<{ ok: true }>(`/attempts/${id}/heartbeat`),
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
