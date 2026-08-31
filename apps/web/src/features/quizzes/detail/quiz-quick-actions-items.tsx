import { Archive, ArchiveRestore, Copy, Download, Trash2 } from 'lucide-react'
import type { useQuizQuickActions } from './use-quiz-quick-actions'

/** The Quick actions, as plain rows — used inside both the sidebar Quick
 * actions card and (wrapped in DropdownMenuItem) the header "..." menu.
 * Archive/Restore are mutually exclusive by quiz status, so this always
 * returns exactly one of them, never both. */
export const QUICK_ACTION_ITEMS = (
  actions: ReturnType<typeof useQuizQuickActions>,
  onDeleteClick: () => void,
) => [
  {
    key: 'duplicate',
    label: actions.duplicate.isPending ? 'Duplicating…' : 'Duplicate quiz',
    icon: Copy,
    onClick: () => actions.duplicate.mutate(),
    disabled: actions.duplicate.isPending,
  },
  {
    key: 'export',
    label: 'Export quiz',
    icon: Download,
    onClick: actions.exportPdf,
    disabled: false,
  },
  actions.canRestore
    ? {
        key: 'restore',
        label: actions.restore.isPending ? 'Restoring…' : 'Restore quiz',
        icon: ArchiveRestore,
        onClick: () => actions.restore.mutate(),
        disabled: actions.restore.isPending,
      }
    : {
        key: 'archive',
        label: actions.archive.isPending ? 'Archiving…' : 'Archive quiz',
        icon: Archive,
        onClick: () => actions.archive.mutate(),
        disabled: !actions.canArchive || actions.archive.isPending,
      },
  {
    key: 'delete',
    label: 'Delete quiz',
    icon: Trash2,
    onClick: onDeleteClick,
    disabled: false,
    destructive: true,
  },
]
