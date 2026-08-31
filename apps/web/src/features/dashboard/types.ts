import type { QuizStatus, QuizSummary } from '../quizzes/types'

export interface DashboardStats {
  totalQuizzes: number
  totalMembers: number
  totalAttempts: number
  averageScorePercent: number | null
}

export interface QuizStatusCount {
  status: QuizStatus
  count: number
}

export interface AttemptsOverTimePoint {
  date: string
  count: number
}

export interface AssignmentTarget {
  type: 'STUDENT' | 'GROUP'
  name: string
}

export interface UpcomingQuiz {
  id: string
  quizId: string
  quizTitle: string
  dueAt: string | null
  target: AssignmentTarget
}

export interface AdminDashboardOverview {
  stats: DashboardStats
  quizStatusBreakdown: QuizStatusCount[]
  attemptsOverTime: AttemptsOverTimePoint[]
  quizzes: QuizSummary[]
  upcomingQuizzes: UpcomingQuiz[]
}

export type DashboardRange = '7d' | '30d' | '90d'

export interface CalendarAssignment {
  id: string
  quizId: string
  quizTitle: string
  dueAt: string | null
  target: AssignmentTarget
}
