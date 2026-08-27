import { apiGet } from '../../lib/api-client'
import type { MyAnalytics, QuizAnalytics } from './types'

export const analyticsApi = {
  forQuiz: (quizId: string) => apiGet<QuizAnalytics>(`/quizzes/${quizId}/analytics`),
  mine: () => apiGet<MyAnalytics>('/students/me/analytics'),
}
