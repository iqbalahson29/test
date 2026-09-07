import type { QuestionDifficulty, QuestionType, QuizModule } from '@quiz-platform/shared'

export interface ScoreDistributionBucket {
  bucket: string
  count: number
}

export interface PerQuestionStat {
  questionId: string
  prompt: string
  type: QuestionType
  points: string
  difficulty: QuestionDifficulty | null
  module: QuizModule
  percentCorrect: number | null
  averagePercent: number | null
}

export interface DifficultyStat {
  difficulty: QuestionDifficulty
  questionCount: number
  averagePercent: number | null
}

export interface ModuleStat {
  module: QuizModule
  questionCount: number
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
  byDifficulty: DifficultyStat[]
  byModule: ModuleStat[]
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
