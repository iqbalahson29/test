import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type {
  DirectoryEntry,
  JoinByCodeResult,
  MyJoinRequest,
  OwnTenantInfo,
  PendingJoinRequest,
  PublicTenantInfo,
  UpdateTenantProfileInput,
} from './types'

export const workspaceDirectoryApi = {
  list: () => apiGet<DirectoryEntry[]>('/workspace-join-requests/directory'),
  mine: () => apiGet<MyJoinRequest[]>('/workspace-join-requests/mine'),
  request: (tenantId: string) =>
    apiPost<{ id: string }>('/workspace-join-requests', { tenantId }),
  cancel: (id: string) => apiDelete(`/workspace-join-requests/${id}`),
  pendingForMyTenant: () => apiGet<PendingJoinRequest[]>('/workspace-join-requests'),
  approve: (id: string) => apiPost(`/workspace-join-requests/${id}/approve`),
  reject: (id: string) => apiPost(`/workspace-join-requests/${id}/reject`),
  bySlug: (slug: string) =>
    apiGet<PublicTenantInfo>(`/workspace-join-requests/by-slug/${slug}`),
  myTenant: () => apiGet<OwnTenantInfo>('/workspace-join-requests/my-tenant'),
  updateMyTenant: (data: UpdateTenantProfileInput) =>
    apiPatch<OwnTenantInfo>('/workspace-join-requests/my-tenant', data),
  setJoinCode: (joinCode: string) =>
    apiPatch<OwnTenantInfo>('/workspace-join-requests/my-tenant/join-code', { joinCode }),
  generateJoinCode: () =>
    apiPost<OwnTenantInfo>('/workspace-join-requests/my-tenant/join-code/generate'),
  clearJoinCode: () => apiDelete<OwnTenantInfo>('/workspace-join-requests/my-tenant/join-code'),
  joinByCode: (code: string) =>
    apiPost<JoinByCodeResult>('/workspace-join-requests/join-by-code', { code }),
}
