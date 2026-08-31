import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api-client'

export type TenantStatus = 'ACTIVE' | 'SUSPENDED'

export interface SuperAdminTenant {
  id: string
  name: string
  slug: string
  description: string | null
  status: TenantStatus
  suspendedAt: string | null
  memberCount: number
  quizCount: number
  groupCount: number
  assignmentCount: number
  attemptCount: number
  createdAt: string
}

export interface SuperAdminUserMembership {
  tenantId: string
  tenantName: string
  role: 'ADMIN' | 'STUDENT'
}

export interface SuperAdminUser {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  isSuspended: boolean
  suspendedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  memberships: SuperAdminUserMembership[]
}

export interface UpdateUserInput {
  name?: string
  email?: string
  newPassword?: string
}

export const superAdminApi = {
  tenants: () => apiGet<SuperAdminTenant[]>('/tenants'),
  suspendTenant: (id: string) => apiPost<SuperAdminTenant>(`/tenants/${id}/suspend`),
  reactivateTenant: (id: string) => apiPost<SuperAdminTenant>(`/tenants/${id}/reactivate`),
  deleteTenant: (id: string, slug: string) =>
    apiDelete<{ id: string }>(`/tenants/${id}`, { slug }),

  users: () => apiGet<SuperAdminUser[]>('/users'),
  updateUser: (id: string, data: UpdateUserInput) =>
    apiPatch<{ id: string; name: string; email: string }>(`/users/${id}`, data),
  suspendUser: (id: string) =>
    apiPost<{ id: string; isSuspended: boolean; suspendedAt: string | null }>(`/users/${id}/suspend`),
  reactivateUser: (id: string) =>
    apiPost<{ id: string; isSuspended: boolean; suspendedAt: string | null }>(
      `/users/${id}/reactivate`,
    ),
  deleteUser: (id: string, email: string) =>
    apiDelete<{ id: string }>(`/users/${id}`, { email }),
}
