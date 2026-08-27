import type { MyAssignmentStatus } from '../assignments/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export const STATUS_LABELS: Record<MyAssignmentStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  GRADED: 'Graded',
}

const STATUS_STYLES: Record<MyAssignmentStatus, string> = {
  NOT_STARTED: 'bg-muted text-muted-foreground [&>svg]:text-muted-foreground/70',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 [&>svg]:text-blue-500',
  SUBMITTED: 'bg-amber-50 text-amber-700 [&>svg]:text-amber-500',
  GRADED: 'bg-emerald-50 text-emerald-700 [&>svg]:text-emerald-500',
}

export function AttemptStatusBadge({ status }: { status: MyAssignmentStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 border-transparent font-medium', STATUS_STYLES[status])}
    >
      <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0">
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
