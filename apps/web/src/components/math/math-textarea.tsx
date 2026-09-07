import { Sigma } from 'lucide-react'
import { EquationEditorDialog } from './equation-editor-dialog'
import { MathText } from './math-text'
import { useMathInsertion } from './use-math-insertion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/** Full-width multi-line text field (question prompt) with an "insert
 * equation" button and an always-visible live math preview below. */
export function MathTextarea({
  id,
  value,
  onChange,
  rows,
  required,
}: {
  id?: string
  value: string
  onChange: (next: string) => void
  rows?: number
  required?: boolean
}) {
  const { elRef, dialogOpen, openDialog, closeDialog, handleInsert } =
    useMathInsertion<HTMLTextAreaElement>(value, onChange)

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <Textarea
          id={id}
          ref={elRef}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Insert equation"
          onClick={openDialog}
        >
          <Sigma />
        </Button>
      </div>
      {value.trim() && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Preview</p>
          <MathText text={value} />
        </div>
      )}
      <EquationEditorDialog open={dialogOpen} onOpenChange={closeDialog} onInsert={handleInsert} />
    </div>
  )
}
