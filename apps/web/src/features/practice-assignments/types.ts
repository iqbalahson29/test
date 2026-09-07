export interface AssignmentTarget {
  type: 'STUDENT' | 'GROUP'
  name: string
  email?: string
  avatarUrl?: string | null
}

export interface AssignmentSummary {
  id: string
  dueAt: string | null
  target: AssignmentTarget
}

export interface AssignedStudent {
  id: string
  name: string
  avatarUrl: string | null
}

export interface AssignmentQuizSummary {
  assignedStudents: AssignedStudent[]
  nearestDueAt: string | null
}

export interface CreateAssignmentInput {
  quizId: string
  studentEmail?: string
  studentMembershipId?: string
  groupId?: string
  dueAt?: string
}

export interface AssignAllInput {
  quizId: string
  dueAt?: string
}

export interface AssignAllResult {
  assigned: number
  alreadyAssigned: number
  totalStudents: number
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
