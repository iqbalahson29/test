import { useEffect, useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** A modal wrapping a single MathLive `<math-field>` with its virtual math
 * keyboard shown — the "toolbar equation builder" used to author math
 * without hand-typing LaTeX. Returns the field's LaTeX value on Insert. */
export function EquationEditorDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (latex: string, displayMode: boolean) => void
}) {
  const fieldRef = useRef<MathfieldElement>(null)
  const [displayMode, setDisplayMode] = useState(false)

  useEffect(() => {
    if (!open) return
    const mf = fieldRef.current
    setDisplayMode(false)
    // Give the dialog's own mount/focus-trap a beat to settle before
    // focusing the field and forcing its virtual keyboard open — this
    // component always starts from a blank field (equations are inserted
    // fresh, not edited in place).
    const timer = setTimeout(() => {
      mf?.setValue('')
      mf?.focus()
      window.mathVirtualKeyboard?.show({ animate: false })
    }, 50)
    return () => {
      clearTimeout(timer)
      window.mathVirtualKeyboard?.hide({ animate: false })
    }
  }, [open])

  const insert = () => {
    const latex = fieldRef.current?.getValue('latex')?.trim()
    if (latex) onInsert(latex, displayMode)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Insert equation</DialogTitle>
          <DialogDescription>
            Build the equation with the keyboard below, then insert it into the text.
          </DialogDescription>
        </DialogHeader>

        <math-field
          ref={fieldRef}
          math-virtual-keyboard-policy="manual"
          className="block w-full rounded-md border border-input px-3 py-3 text-lg"
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={displayMode}
            onChange={(e) => setDisplayMode(e.target.checked)}
          />
          Show on its own centered line (block equation)
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={insert}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
