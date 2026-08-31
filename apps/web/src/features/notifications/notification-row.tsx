import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NOTIFICATION_META, timeAgo } from './notification-meta'
import type { NotificationItem } from './types'

export function NotificationRow({
  notification,
  onSelect,
  onDelete,
}: {
  notification: NotificationItem
  onSelect: (notification: NotificationItem) => void
  onDelete?: (id: string) => void
}) {
  const meta = NOTIFICATION_META[notification.type]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(notification)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(notification)
      }}
      className={cn(
        'group flex w-full cursor-pointer items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50',
        !notification.read && 'bg-primary-50/40',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          meta.badgeClass,
        )}
      >
        <meta.icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-800">{notification.title}</p>
        {notification.body && (
          <p className="text-[12px] text-gray-500">{notification.body}</p>
        )}
        <p className="mt-0.5 text-[11px] text-gray-400">{timeAgo(notification.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!notification.read && <span className="mt-1.5 size-1.5 rounded-full bg-primary-600" />}
        {onDelete && (
          <button
            type="button"
            aria-label="Delete notification"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(notification.id)
            }}
            className="rounded p-1 text-gray-300 opacity-0 hover:bg-gray-200 hover:text-gray-500 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
