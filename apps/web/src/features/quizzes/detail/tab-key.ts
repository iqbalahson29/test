export type QuizTabKey =
  | 'overview'
  | 'questions'
  | 'settings'
  | 'assign'
  | 'results'
  | 'analytics'
  | 'grading'

export const QUIZ_TABS: { key: QuizTabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'questions', label: 'Questions' },
  { key: 'settings', label: 'Settings' },
  { key: 'assign', label: 'Assign & Schedule' },
  { key: 'results', label: 'Results' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'grading', label: 'Grading queue' },
]
