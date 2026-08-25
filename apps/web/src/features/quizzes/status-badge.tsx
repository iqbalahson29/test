import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { QuizStatus } from './types'

const STYLES: Record<QuizStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground [&>svg]:text-muted-foreground/70',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 [&>svg]:text-emerald-500',
  ARCHIVED: 'bg-amber-50 text-amber-700 [&>svg]:text-amber-500',
}

const LABELS: Record<QuizStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
}

export function StatusBadge({ status }: { status: QuizStatus }) {
  return (
    <Badge variant="secondary" className={cn('gap-1.5 border-transparent font-medium', STYLES[status])}>
      <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0">
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
      {LABELS[status]}
    </Badge>
  )
}
