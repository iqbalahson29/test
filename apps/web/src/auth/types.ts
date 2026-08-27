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
  | { status: 'choose-workspace'; selectionToken: string; choices: Membership[] }
  | { status: 'no-workspace'; accessToken: string }

// /auth/refresh, /auth/select-workspace, and /auth/switch-workspace never
// return 'choose-workspace' — narrowed so callers don't handle a branch
// that can't happen.
export type RefreshApiResponse = Extract<
  LoginApiResponse,
  { status: 'ok' | 'superadmin' | 'no-workspace' }
>
export type SelectWorkspaceApiResponse = Extract<LoginApiResponse, { status: 'ok' }>

export function homePathForRole(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return '/admin'
    case 'STUDENT':
      return '/student'
  }
}
