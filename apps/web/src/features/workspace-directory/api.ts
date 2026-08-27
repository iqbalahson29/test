import { apiDelete, apiGet, apiPost } from '../../lib/api-client'
import type { DirectoryEntry, MyJoinRequest, PendingJoinRequest } from './types'

export const workspaceDirectoryApi = {
  list: () => apiGet<DirectoryEntry[]>('/workspace-join-requests/directory'),
  mine: () => apiGet<MyJoinRequest[]>('/workspace-join-requests/mine'),
  request: (tenantId: string) =>
    apiPost<{ id: string }>('/workspace-join-requests', { tenantId }),
  cancel: (id: string) => apiDelete(`/workspace-join-requests/${id}`),
  pendingForMyTenant: () => apiGet<PendingJoinRequest[]>('/workspace-join-requests'),
  approve: (id: string) => apiPost(`/workspace-join-requests/${id}/approve`),
  reject: (id: string) => apiPost(`/workspace-join-requests/${id}/reject`),
}
