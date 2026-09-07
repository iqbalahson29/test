import { apiGet } from '../../lib/api-client'
import type { MyAnalytics, QuizAnalytics } from './types'

export const practiceAnalyticsApi = {
  forQuiz: (quizId: string) => apiGet<QuizAnalytics>(`/practice-quizzes/${quizId}/analytics`),
  mine: () => apiGet<MyAnalytics>('/students/me/practice-analytics'),
}
