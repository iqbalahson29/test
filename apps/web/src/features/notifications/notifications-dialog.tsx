import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notificationsApi } from './api'
import { NotificationRow } from './notification-row'
import {
  useClearAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from './use-notifications'
import type { NotificationItem } from './types'

const PAGE_LIMIT = 20

export function NotificationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [items, setItems] = useState<NotificationItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const remove = useDeleteNotification()
  const clearAll = useClearAllNotifications()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    notificationsApi
      .list({ limit: PAGE_LIMIT })
      .then((page) => {
        setItems(page.items)
        setCursor(page.nextCursor)
      })
      .finally(() => setLoading(false))
  }, [open])

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await notificationsApi.list({ limit: PAGE_LIMIT, cursor })
      setItems((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  const visible = tab === 'unread' ? items.filter((n) => !n.read) : items

  const onSelect = async (n: NotificationItem) => {
    onOpenChange(false)
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      markRead.mutate(n.id)
    }
    if (n.link) navigate(n.link)
  }

  const onDelete = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
    remove.mutate(id)
  }

  const onMarkAllRead = () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    markAllRead.mutate()
  }

  const onClearAll = () => {
    setItems([])
    setCursor(null)
    clearAll.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-4">
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription className="sr-only">All your notifications</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between px-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'unread')}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={items.every((n) => n.read)}
              className="text-[11.5px] font-semibold text-primary-600 hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={items.length === 0}
              className="text-[11.5px] font-semibold text-gray-400 hover:text-rose-600 hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </div>
        <ScrollArea className="h-[420px] border-t border-gray-100">
          {loading ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-gray-400">
              {tab === 'unread' ? "You're all caught up." : 'No notifications yet.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {visible.map((n) => (
                <NotificationRow key={n.id} notification={n} onSelect={onSelect} onDelete={onDelete} />
              ))}
            </div>
          )}
        </ScrollArea>
        {tab === 'all' && cursor && (
          <div className="border-t border-gray-100 px-5 py-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
