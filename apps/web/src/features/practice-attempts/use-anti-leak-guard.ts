import { useEffect, useState } from 'react'

/**
 * Best-effort deterrents against casually screenshotting, copying, or printing
 * quiz content. None of this can actually stop screen capture — browsers give
 * websites no such permission, and a phone camera defeats all of it regardless.
 * This only raises friction and closes the easy paths: right-click save,
 * select-and-copy, Ctrl+P/S/U, and a quick alt-tab to a capture tool.
 */
export function useAntiLeakGuard(active: boolean) {
  const [obscured, setObscured] = useState(false)

  useEffect(() => {
    if (!active) {
      setObscured(false)
      return
    }

    const blockContextMenu = (e: MouseEvent) => e.preventDefault()
    const blockClipboardEvent = (e: ClipboardEvent) => e.preventDefault()

    const blockKeys = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && (key === 'p' || key === 's' || key === 'u')) {
        e.preventDefault()
      }
      // Best-effort only: catches the plain PrtScn-to-clipboard case, not
      // Win+PrtScn/Snipping Tool (which save straight to a file) or a phone
      // camera. Silently no-ops where the Clipboard API isn't available.
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {})
      }
    }

    const handleVisibility = () => setObscured(document.hidden)
    const handleBlur = () => setObscured(true)
    const handleFocus = () => setObscured(false)

    document.addEventListener('contextmenu', blockContextMenu)
    document.addEventListener('copy', blockClipboardEvent)
    document.addEventListener('cut', blockClipboardEvent)
    document.addEventListener('keydown', blockKeys)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)

    const printStyle = document.createElement('style')
    printStyle.textContent = `
      @media print {
        body { visibility: hidden !important; }
        body::after {
          content: 'Printing is disabled for this quiz.';
          visibility: visible;
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-family: sans-serif;
        }
      }
    `
    document.head.appendChild(printStyle)

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu)
      document.removeEventListener('copy', blockClipboardEvent)
      document.removeEventListener('cut', blockClipboardEvent)
      document.removeEventListener('keydown', blockKeys)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      printStyle.remove()
    }
  }, [active])

  return obscured
}
