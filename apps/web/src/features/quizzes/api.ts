import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type {
  CreateQuestionInput,
  CreateQuizInput,
  QuestionDetail,
  QuizDetail,
  QuizStatus,
  QuizSummary,
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
}

export const questionsApi = {
  create: (quizId: string, data: CreateQuestionInput) =>
    apiPost<QuestionDetail>(`/quizzes/${quizId}/questions`, data),
  update: (quizId: string, id: string, data: Partial<CreateQuestionInput>) =>
    apiPatch<QuestionDetail>(`/quizzes/${quizId}/questions/${id}`, data),
  remove: (quizId: string, id: string) =>
    apiDelete<{ id: string }>(`/quizzes/${quizId}/questions/${id}`),
  reorder: (quizId: string, orderedIds: string[]) =>
    apiPatch<{ ok: true }>(`/quizzes/${quizId}/questions/reorder`, {
      orderedIds,
    }),
}
