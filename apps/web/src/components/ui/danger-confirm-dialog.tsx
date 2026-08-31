import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

interface DangerConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  /** The exact value (e.g. a workspace slug) the user must type to enable the confirm button. */
  confirmationValue: string
  confirmationLabel: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
}

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmationValue,
  confirmationLabel,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
}: DangerConfirmDialogProps) {
  const [input, setInput] = useState('')

  useEffect(() => {
    if (!open) setInput('')
  }, [open])

  const matches = input === confirmationValue

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="danger-confirm-input">{confirmationLabel}</Label>
          <Input
            id="danger-confirm-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            autoFocus
            placeholder={confirmationValue}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!matches || loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
