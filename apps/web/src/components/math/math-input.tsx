import { Sigma } from 'lucide-react'
import { EquationEditorDialog } from './equation-editor-dialog'
import { MathText } from './math-text'
import { useMathInsertion } from './use-math-insertion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Compact single-line text field (option text, matching pairs, accepted
 * answers) with an "insert equation" button and a small live math preview —
 * for dense per-row editors where a full MathTextarea would be too tall. */
export function MathInput({
  value,
  onChange,
  placeholder,
  className,
  required,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  required?: boolean
}) {
  const { elRef, dialogOpen, openDialog, closeDialog, handleInsert } =
    useMathInsertion<HTMLInputElement>(value, onChange)

  return (
    <div className={cn('min-w-0 flex-1 space-y-1', className)}>
      <div className="flex items-center gap-1">
        <Input
          ref={elRef}
          type="text"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Insert equation"
          onClick={openDialog}
        >
          <Sigma />
        </Button>
      </div>
      {value.includes('$') && (
        <div className="rounded-md bg-muted/40 px-2 py-1 text-sm">
          <MathText text={value} />
        </div>
      )}
      <EquationEditorDialog open={dialogOpen} onOpenChange={closeDialog} onInsert={handleInsert} />
    </div>
  )
}
