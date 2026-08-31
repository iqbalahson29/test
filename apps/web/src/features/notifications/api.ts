import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import type { NotificationsPage } from './types'

export const notificationsApi = {
  list: (params?: { cursor?: string; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.cursor) query.set('cursor', params.cursor)
    if (params?.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    return apiGet<NotificationsPage>(`/notifications${qs ? `?${qs}` : ''}`)
  },
  unreadCount: () => apiGet<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPatch<void>(`/notifications/${id}/read`),
  markAllRead: () => apiPost<{ ok: true }>('/notifications/read-all'),
  remove: (id: string) => apiDelete<{ id: string }>(`/notifications/${id}`),
  clearAll: () => apiDelete<{ ok: true }>('/notifications/clear-all'),
}
