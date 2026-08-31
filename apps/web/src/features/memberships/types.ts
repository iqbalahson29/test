import type { Role } from '@quiz-platform/shared'

export interface MembershipRow {
  id: string
  role: Role
  createdAt: string
  user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
    lastLoginAt: string | null
  }
}

export interface ActivityEntry {
  id: string
  action: string
  message: string
  createdAt: string
}

export interface MemberProfile {
  id: string
  role: Role
  joinedAt: string
  user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
    firstName: string | null
    lastName: string | null
    dateOfBirth: string | null
    bio: string | null
    phone: string | null
    location: string | null
    timezone: string | null
    locale: string | null
    gradeLevel: string | null
    studentId: string | null
    guardianName: string | null
    guardianContact: string | null
    lastLoginAt: string | null
  }
  groups: { id: string; name: string }[]
}
