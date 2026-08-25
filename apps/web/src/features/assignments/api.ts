import { apiDelete, apiGet, apiPost } from '../../lib/api-client'
import type {
  AssignmentSummary,
  CreateAssignmentInput,
  MembershipSummary,
  MyAssignment,
} from './types'

export const assignmentsApi = {
  listForQuiz: (quizId: string) =>
    apiGet<AssignmentSummary[]>(`/assignments?quizId=${quizId}`),
  create: (data: CreateAssignmentInput) =>
    apiPost<AssignmentSummary>('/assignments', data),
  remove: (id: string) => apiDelete<{ id: string }>(`/assignments/${id}`),
  mine: () => apiGet<MyAssignment[]>('/assignments/mine'),
}

export const membershipsApi = {
  list: () => apiGet<MembershipSummary[]>('/memberships'),
}
