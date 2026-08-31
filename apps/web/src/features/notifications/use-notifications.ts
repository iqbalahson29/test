import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from './api'

// Polled rather than pushed — good enough for a badge count / recent list,
// and avoids adding a websocket/SSE channel for this.
const POLL_INTERVAL_MS = 30_000

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: POLL_INTERVAL_MS,
    enabled,
  })
}

export function useRecentNotifications(limit = 6, enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'recent', limit],
    queryFn: () => notificationsApi.list({ limit }),
    refetchInterval: POLL_INTERVAL_MS,
    enabled,
  })
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
  })
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: invalidate,
  })
}

export function useDeleteNotification() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.remove(id),
    onSuccess: invalidate,
  })
}

export function useClearAllNotifications() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: notificationsApi.clearAll,
    onSuccess: invalidate,
  })
}
