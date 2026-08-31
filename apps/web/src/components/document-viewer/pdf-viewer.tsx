import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'

export function PdfViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null

    async function render() {
      const pdfjsLib = await import('pdfjs-dist')
      const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) })
      const pdf = await loadingTask.promise
      if (cancelled) {
        void pdf.cleanup()
        return
      }
      setNumPages(pdf.numPages)

      const container = containerRef.current
      if (!container) return
      container.innerHTML = ''

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (cancelled) return
        const page = await pdf.getPage(pageNum)
        const containerWidth = container.clientWidth || 800
        const unscaled = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: containerWidth / unscaled.width })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = 'w-full rounded-md border border-gray-200 shadow-sm'
        container.appendChild(canvas)

        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
      }
    }

    render().catch(() => {
      if (!cancelled) setError('Could not render this PDF.')
    })

    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [data])

  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <div className="space-y-2">
      {numPages && (
        <p className="text-xs text-muted-foreground">
          {numPages} page{numPages === 1 ? '' : 's'}
        </p>
      )}
      <div ref={containerRef} className="space-y-3" onContextMenu={(e) => e.preventDefault()} />
    </div>
  )
}
