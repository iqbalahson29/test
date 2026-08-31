import {
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'
import type { NotificationType } from './types'

export const NOTIFICATION_META: Record<
  NotificationType,
  { icon: typeof ClipboardList; badgeClass: string }
> = {
  QUIZ_ASSIGNED: { icon: ClipboardList, badgeClass: 'bg-primary-50 text-primary-600' },
  JOIN_REQUEST_APPROVED: { icon: Check, badgeClass: 'bg-emerald-50 text-emerald-600' },
  JOIN_REQUEST_REJECTED: { icon: UserX, badgeClass: 'bg-rose-50 text-rose-600' },
  MEMBER_JOINED: { icon: Users, badgeClass: 'bg-gray-100 text-gray-600' },
  INVITE_ACCEPTED: { icon: Users, badgeClass: 'bg-gray-100 text-gray-600' },
  RESPONSE_GRADED: { icon: CheckCircle2, badgeClass: 'bg-emerald-50 text-emerald-600' },
  GRADING_PENDING: { icon: FileWarning, badgeClass: 'bg-amber-50 text-amber-600' },
  WORKSPACE_REQUEST_SUBMITTED: { icon: Building2, badgeClass: 'bg-primary-50 text-primary-600' },
  USER_REGISTERED: { icon: UserPlus, badgeClass: 'bg-gray-100 text-gray-600' },
}

export function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
