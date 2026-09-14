import type { Role } from '@quiz-platform/shared'
import { apiDelete, apiGet, apiPost } from '../../lib/api-client'
import type {
  BulkInvitationResult,
  CreateInvitationResult,
  PendingInvitation,
} from './types'

export const memberInvitationsApi = {
  list: () => apiGet<PendingInvitation[]>('/member-invitations'),
  create: (email: string, role: Role) =>
    apiPost<CreateInvitationResult>('/member-invitations', { email, role }),
  bulkCreate: (entries: { email: string; role: Role }[]) =>
    apiPost<BulkInvitationResult>('/member-invitations/bulk', { entries }),
  revoke: (id: string) => apiDelete(`/member-invitations/${id}`),
  resend:(id:string)=>apiPost(`/member-invitations/${id}/resend`),
}
