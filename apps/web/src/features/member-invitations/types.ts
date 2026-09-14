import type { Role } from '@quiz-platform/shared'

export interface PendingInvitation {
  id: string
  email: string
  role: Role
  expiresAt:string
  deliveryStatus:string
  deliveryError:string|null
  createdAt: string
}

export type CreateInvitationResult =
  | { status: 'added'; id: string; email: string; role: Role }
  | { status: 'invited'; id: string; email: string; role: Role }

export interface BulkInvitationResult {
  added: CreateInvitationResult[]
  invited: CreateInvitationResult[]
  failed: { email: string; reason: string }[]
}

export interface InvitationPreview {
  tenantName: string
  maskedEmail: string
  role: Role
  expiresAt:string
}
