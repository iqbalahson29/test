import { apiDelete, apiGet, apiPost } from '../../lib/api-client'
import type {
  AssignAllInput,
  AssignAllResult,
  AssignmentQuizSummary,
  AssignmentSummary,
  CreateAssignmentInput,
  MyAssignment,
} from './types'

export const assignmentsApi = {
  listForQuiz: (quizId: string) =>
    apiGet<AssignmentSummary[]>(`/assignments?quizId=${quizId}`),
  summary: (quizId: string) =>
    apiGet<AssignmentQuizSummary>(`/assignments/summary?quizId=${quizId}`),
  create: (data: CreateAssignmentInput) =>
    apiPost<AssignmentSummary>('/assignments', data),
  assignAll: (data: AssignAllInput) =>
    apiPost<AssignAllResult>('/assignments/all', data),
  remove: (id: string) => apiDelete<{ id: string }>(`/assignments/${id}`),
  mine: () => apiGet<MyAssignment[]>('/assignments/mine'),
}
