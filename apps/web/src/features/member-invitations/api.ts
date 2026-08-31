import type { Role } from '@quiz-platform/shared'
import { apiDelete, apiGet, apiPost } from '../../lib/api-client'
import type {
  BulkInvitationResult,
  CreateInvitationResult,
  InvitationPreview,
  PendingInvitation,
} from './types'

export const memberInvitationsApi = {
  list: () => apiGet<PendingInvitation[]>('/member-invitations'),
  create: (email: string, role: Role) =>
    apiPost<CreateInvitationResult>('/member-invitations', { email, role }),
  bulkCreate: (entries: { email: string; role: Role }[]) =>
    apiPost<BulkInvitationResult>('/member-invitations/bulk', { entries }),
  revoke: (id: string) => apiDelete(`/member-invitations/${id}`),
  byToken: (token: string) =>
    apiGet<InvitationPreview>(`/member-invitations/by-token/${token}`),
  accept: (token: string, name: string, password: string) =>
    apiPost<{ id: string; email: string }>(`/member-invitations/${token}/accept`, {
      name,
      password,
    }),
}
