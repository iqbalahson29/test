import { Link } from 'react-router-dom'
import { BarChart3, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { QuizStatus, QuizSummary } from './types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const STATUS_ACTIONS: Record<QuizStatus, { label: string; status: QuizStatus }[]> = {
  DRAFT: [{ label: 'Publish', status: 'PUBLISHED' }],
  SCHEDULED: [
    { label: 'Publish now', status: 'PUBLISHED' },
    { label: 'Unschedule', status: 'DRAFT' },
  ],
  PUBLISHED: [
    { label: 'Unpublish', status: 'DRAFT' },
    { label: 'Archive', status: 'ARCHIVED' },
  ],
  ARCHIVED: [{ label: 'Restore', status: 'DRAFT' }],
}

export function QuizRowMenu({
  quiz,
  onStatusChange,
  onDelete,
  disabled,
}: {
  quiz: QuizSummary
  onStatusChange: (status: QuizStatus) => void
  onDelete: () => void
  disabled: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${quiz.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild className="gap-2 px-2.5 py-2">
          <Link to={`/teacher/quizzes/${quiz.id}`}>
            <Pencil />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 px-2.5 py-2">
          <Link to={`/teacher/quizzes/${quiz.id}/analytics`}>
            <BarChart3 />
            Analytics
          </Link>
        </DropdownMenuItem>
        {STATUS_ACTIONS[quiz.status].length > 0 && <DropdownMenuSeparator />}
        {STATUS_ACTIONS[quiz.status].map((action) => (
          <DropdownMenuItem
            key={action.status}
            disabled={disabled}
            onSelect={() => onStatusChange(action.status)}
            className="gap-2 px-2.5 py-2"
          >
            {action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={disabled}
          onSelect={onDelete}
          className="gap-2 px-2.5 py-2"
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
