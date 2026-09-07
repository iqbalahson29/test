import { Copy, Eye, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { QuestionDetail } from '../types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function QuestionRowMenu({
  question,
  editable,
  onView,
  onEdit,
  onDuplicate,
  onRegrade,
  onDelete,
  disabled,
}: {
  question: QuestionDetail
  editable: boolean
  onView: () => void
  onEdit: () => void
  onDuplicate?: () => void
  onRegrade?: () => void
  onDelete?: () => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for question: ${question.prompt}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="gap-2 px-2.5 py-2" onSelect={onView}>
          <Eye />
          View
        </DropdownMenuItem>
        {editable && (
          <DropdownMenuItem className="gap-2 px-2.5 py-2" onSelect={onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
        )}
        {onDuplicate && (
          <DropdownMenuItem className="gap-2 px-2.5 py-2" disabled={disabled} onSelect={onDuplicate}>
            <Copy />
            Duplicate
          </DropdownMenuItem>
        )}
        {onRegrade && (
          <DropdownMenuItem className="gap-2 px-2.5 py-2" disabled={disabled} onSelect={onRegrade}>
            <RefreshCw />
            Regrade
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="gap-2 px-2.5 py-2"
              disabled={disabled}
              onSelect={onDelete}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
