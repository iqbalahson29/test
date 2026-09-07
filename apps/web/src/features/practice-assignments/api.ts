import { apiDelete, apiGet, apiPost } from '../../lib/api-client'
import type { CalendarAssignment } from '../dashboard/types'
import type {
  AssignAllInput,
  AssignAllResult,
  AssignmentQuizSummary,
  AssignmentSummary,
  CreateAssignmentInput,
  MyAssignment,
} from './types'

export const practiceAssignmentsApi = {
  listForQuiz: (quizId: string) =>
    apiGet<AssignmentSummary[]>(`/practice-assignments?quizId=${quizId}`),
  summary: (quizId: string) =>
    apiGet<AssignmentQuizSummary>(`/practice-assignments/summary?quizId=${quizId}`),
  create: (data: CreateAssignmentInput) =>
    apiPost<AssignmentSummary>('/practice-assignments', data),
  assignAll: (data: AssignAllInput) =>
    apiPost<AssignAllResult>('/practice-assignments/all', data),
  remove: (id: string) => apiDelete<{ id: string }>(`/practice-assignments/${id}`),
  mine: () => apiGet<MyAssignment[]>('/practice-assignments/mine'),
  // Mirrors dashboardApi.calendar() but scoped to practice-quiz assignments
  // — the admin dashboard itself isn't wired up for practice quizzes yet,
  // so this page's own sidebar calendar fetches it directly.
  calendar: () => apiGet<CalendarAssignment[]>('/practice-assignments/calendar'),
}
