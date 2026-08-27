export interface AssignmentTarget {
  type: 'STUDENT' | 'GROUP'
  name: string
  email?: string
}

export interface AssignmentSummary {
  id: string
  dueAt: string | null
  target: AssignmentTarget
}

export interface CreateAssignmentInput {
  quizId: string
  studentEmail?: string
  studentMembershipId?: string
  groupId?: string
  dueAt?: string
}

export type MyAssignmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'

export interface MyAssignment {
  assignmentId: string
  quizId: string
  quizTitle: string
  dueAt: string | null
  timeLimitSec: number | null
  maxAttempts: number | null
  attemptsUsed: number
  status: MyAssignmentStatus
  latestAttemptId: string | null
  score: string | null
  maxScore: string | null
}
