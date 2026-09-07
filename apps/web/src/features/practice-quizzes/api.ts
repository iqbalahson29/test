import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type { QuizModule } from '@quiz-platform/shared'
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

export const practiceQuizzesApi = {
  list: () => apiGet<QuizSummary[]>('/practice-quizzes'),
  create: (data: CreateQuizInput) => apiPost<QuizDetail>('/practice-quizzes', data),
  get: (id: string) => apiGet<QuizDetail>(`/practice-quizzes/${id}`),
  update: (id: string, data: Partial<CreateQuizInput>) =>
    apiPatch<QuizDetail>(`/practice-quizzes/${id}`, data),
  updateStatus: (id: string, status: QuizStatus) =>
    apiPatch<QuizDetail>(`/practice-quizzes/${id}/status`, { status }),
  remove: (id: string) => apiDelete<{ id: string }>(`/practice-quizzes/${id}`),
  duplicate: (id: string) => apiPost<QuizDetail>(`/practice-quizzes/${id}/duplicate`),
  activity: (id: string) => apiGet<ActivityEntry[]>(`/practice-quizzes/${id}/activity`),
  results: (id: string) => apiGet<ResultRow[]>(`/practice-quizzes/${id}/results`),
  attemptDetail: (id: string, attemptId: string) =>
    apiGet<AttemptDetail>(`/practice-quizzes/${id}/results/${attemptId}`),
  releaseSession: (id: string, attemptId: string) =>
    apiPost<{ ok: true }>(`/practice-quizzes/${id}/results/${attemptId}/release-session`),
  attemptQuestionAttachmentUrlPath: (quizId: string, attemptId: string, questionId: string) =>
    `/practice-quizzes/${quizId}/results/${attemptId}/questions/${questionId}/attachment-url`,
  attemptQuestionImageUrlPath: (quizId: string, attemptId: string, questionId: string) =>
    `/practice-quizzes/${quizId}/results/${attemptId}/questions/${questionId}/image-url`,
  attemptOptionImageUrlPath: (
    quizId: string,
    attemptId: string,
    questionId: string,
    optionId: string,
  ) =>
    `/practice-quizzes/${quizId}/results/${attemptId}/questions/${questionId}/options/${optionId}/image-url`,
}

export interface ImportQuestionsResult {
  created: QuestionDetail[]
  errors: { row: number; message: string }[]
}

export const practiceQuestionsApi = {
  create: (quizId: string, data: CreateQuestionInput) =>
    apiPost<QuestionDetail>(`/practice-quizzes/${quizId}/questions`, data),
  update: (quizId: string, id: string, data: Partial<CreateQuestionInput>) =>
    apiPatch<QuestionDetail>(`/practice-quizzes/${quizId}/questions/${id}`, data),
  remove: (quizId: string, id: string) =>
    apiDelete<{ id: string }>(`/practice-quizzes/${quizId}/questions/${id}`),
  duplicate: (quizId: string, id: string) =>
    apiPost<QuestionDetail>(`/practice-quizzes/${quizId}/questions/${id}/duplicate`),
  reorder: (quizId: string, module: QuizModule, orderedIds: string[]) =>
    apiPatch<{ ok: true }>(`/practice-quizzes/${quizId}/questions/reorder`, {
      module,
      orderedIds,
    }),
  import: (quizId: string, questions: CreateQuestionInput[]) =>
    apiPost<ImportQuestionsResult>(`/practice-quizzes/${quizId}/questions/import`, {
      questions,
    }),
  getAttachmentUploadUrl: (quizId: string, filename: string, contentType: string) =>
    apiPost<{ uploadUrl: string; attachmentKey: string }>(
      `/practice-quizzes/${quizId}/questions/attachment-upload-url`,
      { filename, contentType },
    ),
  attachmentUrlPath: (quizId: string, questionId: string) =>
    `/practice-quizzes/${quizId}/questions/${questionId}/attachment-url`,
  imageUrlPath: (quizId: string, questionId: string) =>
    `/practice-quizzes/${quizId}/questions/${questionId}/image-url`,
  optionImageUrlPath: (quizId: string, questionId: string, optionId: string) =>
    `/practice-quizzes/${quizId}/questions/${questionId}/options/${optionId}/image-url`,
}
