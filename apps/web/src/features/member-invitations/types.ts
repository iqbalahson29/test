import type { Role } from '@quiz-platform/shared'

export interface PendingInvitation {
  id: string
  email: string
  role: Role
  token: string
  createdAt: string
}

export type CreateInvitationResult =
  | { status: 'added'; id: string; email: string; role: Role }
  | { status: 'invited'; id: string; email: string; role: Role; token: string }

export interface BulkInvitationResult {
  added: CreateInvitationResult[]
  invited: CreateInvitationResult[]
  failed: { email: string; reason: string }[]
}

export interface InvitationPreview {
  tenantName: string
  email: string
  role: Role
}
