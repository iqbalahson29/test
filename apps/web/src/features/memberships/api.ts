import type { Role } from '@quiz-platform/shared'
import { apiDelete, apiGet, apiPatch } from '../../lib/api-client'
import type { ActivityEntry, MemberProfile, MembershipRow } from './types'

export const membershipsApi = {
  list: () => apiGet<MembershipRow[]>('/memberships'),
  get: (id: string) => apiGet<MemberProfile>(`/memberships/${id}`),
  remove: (id: string) => apiDelete(`/memberships/${id}`),
  updateRole: (id: string, role: Role) =>
    apiPatch<MembershipRow>(`/memberships/${id}`, { role }),
  recentActivity: (limit?: number) =>
    apiGet<ActivityEntry[]>(`/audit-log/recent${limit ? `?limit=${limit}` : ''}`),
}
