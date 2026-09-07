import { useRef, useState } from 'react'

/** Shared cursor-aware "insert equation" logic for MathInput/MathTextarea:
 * tracks the field's DOM ref so a freshly-built LaTeX snippet (wrapped in
 * $...$ or $$...$$) gets spliced in at the caret rather than just appended,
 * and restores focus/caret position afterward. */
export function useMathInsertion<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  onChange: (next: string) => void,
) {
  const elRef = useRef<T>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleInsert = (latex: string, displayMode: boolean) => {
    const el = elRef.current
    const snippet = displayMode ? `$$${latex}$$` : `$${latex}$`
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + snippet + value.slice(end)
    onChange(next)

    const caretPos = start + snippet.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caretPos, caretPos)
    })
  }

  return {
    elRef,
    dialogOpen,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
    handleInsert,
  }
}
