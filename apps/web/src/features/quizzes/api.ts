import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type {
  ActivityEntry,
  AttemptDetail,
  CreateQuestionInput,
  CreateQuizInput,
  QuestionDetail,
  QuizDetail,
  QuizStatus,
  QuizSummary,
  ResultRow,
} from './types'

export const quizzesApi = {
  list: () => apiGet<QuizSummary[]>('/quizzes'),
  create: (data: CreateQuizInput) => apiPost<QuizDetail>('/quizzes', data),
  get: (id: string) => apiGet<QuizDetail>(`/quizzes/${id}`),
  update: (id: string, data: Partial<CreateQuizInput>) =>
    apiPatch<QuizDetail>(`/quizzes/${id}`, data),
  updateStatus: (id: string, status: QuizStatus) =>
    apiPatch<QuizDetail>(`/quizzes/${id}/status`, { status }),
  remove: (id: string) => apiDelete<{ id: string }>(`/quizzes/${id}`),
  duplicate: (id: string) => apiPost<QuizDetail>(`/quizzes/${id}/duplicate`),
  activity: (id: string) => apiGet<ActivityEntry[]>(`/quizzes/${id}/activity`),
  results: (id: string) => apiGet<ResultRow[]>(`/quizzes/${id}/results`),
  attemptDetail: (id: string, attemptId: string) =>
    apiGet<AttemptDetail>(`/quizzes/${id}/results/${attemptId}`),
  releaseSession: (id: string, attemptId: string) =>
    apiPost<{ ok: true }>(`/quizzes/${id}/results/${attemptId}/release-session`),
}

export interface ImportQuestionsResult {
  created: QuestionDetail[]
  errors: { row: number; message: string }[]
}

export const questionsApi = {
  create: (quizId: string, data: CreateQuestionInput) =>
    apiPost<QuestionDetail>(`/quizzes/${quizId}/questions`, data),
  update: (quizId: string, id: string, data: Partial<CreateQuestionInput>) =>
    apiPatch<QuestionDetail>(`/quizzes/${quizId}/questions/${id}`, data),
  remove: (quizId: string, id: string) =>
    apiDelete<{ id: string }>(`/quizzes/${quizId}/questions/${id}`),
  duplicate: (quizId: string, id: string) =>
    apiPost<QuestionDetail>(`/quizzes/${quizId}/questions/${id}/duplicate`),
  reorder: (quizId: string, orderedIds: string[]) =>
    apiPatch<{ ok: true }>(`/quizzes/${quizId}/questions/reorder`, {
      orderedIds,
    }),
  import: (quizId: string, questions: CreateQuestionInput[]) =>
    apiPost<ImportQuestionsResult>(`/quizzes/${quizId}/questions/import`, {
      questions,
    }),
  getAttachmentUploadUrl: (quizId: string, filename: string, contentType: string) =>
    apiPost<{ uploadUrl: string; attachmentKey: string }>(
      `/quizzes/${quizId}/questions/attachment-upload-url`,
      { filename, contentType },
    ),
  attachmentUrlPath: (quizId: string, questionId: string) =>
    `/quizzes/${quizId}/questions/${questionId}/attachment-url`,
}
