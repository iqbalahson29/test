import type { QuestionType } from '@quiz-platform/shared'

export interface ScoreDistributionBucket {
  bucket: string
  count: number
}

export interface PerQuestionStat {
  questionId: string
  prompt: string
  type: QuestionType
  points: string
  percentCorrect: number | null
  averagePercent: number | null
}

export interface QuizAnalytics {
  quizTitle: string
  totalAttempts: number
  gradedAttempts: number
  averageScore: number | null
  medianScore: number | null
  averagePercent: number | null
  medianPercent: number | null
  maxScore: number
  passMarkPercent: string | null
  passRate: number | null
  scoreDistribution: ScoreDistributionBucket[]
  perQuestion: PerQuestionStat[]
}

export interface MyAttemptAnalytics {
  attemptId: string
  quizTitle: string
  attemptNumber: number
  status: string
  score: string | null
  maxScore: string | null
  percent: number | null
  submittedAt: string | null
}

export interface TrendPoint {
  submittedAt: string
  quizTitle: string
  percent: number
}

export interface MyAnalytics {
  averagePercent: number | null
  attempts: MyAttemptAnalytics[]
  trend: TrendPoint[]
}
