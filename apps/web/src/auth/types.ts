import type { Role } from '@quiz-platform/shared'

export interface Membership {
  membershipId: string
  tenantId: string
  tenantName: string
  role: Role
}

export type LoginApiResponse =
  | { status: 'ok'; accessToken: string; membership: Membership }
  | { status: 'superadmin'; accessToken: string }

export type RefreshApiResponse = LoginApiResponse

export function homePathForRole(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/admin'
    case 'STUDENT':
      return '/student'
  }
}
