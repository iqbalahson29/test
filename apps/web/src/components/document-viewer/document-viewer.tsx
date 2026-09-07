import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import { PdfViewer } from './pdf-viewer'
import { DocxViewer } from './docx-viewer'
import { ImageViewer } from './image-viewer'

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/**
 * Renders a PDF/DOCX inline (canvas for PDF, converted HTML for DOCX) with
 * no download affordance and no direct link exposed in the DOM — a soft
 * view-only presentation, not a hard access-control guarantee. Either pass
 * `data` directly (e.g. a just-selected File before it's uploaded) or a
 * `path` to a backend endpoint that returns `{ viewUrl }`, a short-lived
 * presigned URL this component fetches the bytes from.
 */
export function DocumentViewer({
  mimeType,
  filename,
  path,
  file,
  data: providedData,
  imageThumbnail,
}: {
  mimeType: string | null
  filename: string | null
  /** Backend endpoint returning `{ viewUrl }` for an already-saved attachment. */
  path?: string
  /** A just-picked, not-yet-uploaded file — previewed locally, no request made. */
  file?: File
  data?: ArrayBuffer
  /** Renders a small fixed-size square instead of a large inline preview —
   * only meaningful when the mimeType is an image (e.g. an answer option). */
  imageThumbnail?: boolean
}) {
  const [data, setData] = useState<ArrayBuffer | null>(providedData ?? null)
  const [loading, setLoading] = useState(!providedData && !file && !!path)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (providedData) {
      setData(providedData)
      setLoading(false)
      return
    }
    if (file) {
      let cancelled = false
      setLoading(true)
      setError(null)
      file
        .arrayBuffer()
        .then((buf) => {
          if (!cancelled) setData(buf)
        })
        .catch(() => {
          if (!cancelled) setError('Could not read this file.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }
    if (!path) return
    let cancelled = false
    setLoading(true)
    setError(null)
    async function load() {
      const { viewUrl } = await apiGet<{ viewUrl: string }>(path!)
      const res = await fetch(viewUrl)
      if (!res.ok) throw new Error('fetch failed')
      const buf = await res.arrayBuffer()
      if (!cancelled) setData(buf)
    }
    load()
      .catch(() => {
        if (!cancelled) setError('Could not load this document.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, file, providedData])

  const isImage = mimeType !== null && IMAGE_MIMES.includes(mimeType)

  return (
    <div className={imageThumbnail ? '' : 'space-y-2'}>
      {!isImage && (
        <div className="flex items-center gap-2 text-[12.5px]">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium text-gray-700">
            {filename ?? 'Document'}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            View only
          </span>
        </div>
      )}
      {loading && !imageThumbnail && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {isImage ? 'Loading image…' : 'Loading document…'}
        </p>
      )}
      {error && !imageThumbnail && <p className="text-sm text-destructive">{error}</p>}
      {data && mimeType === PDF_MIME && <PdfViewer data={data} />}
      {data && mimeType === DOCX_MIME && <DocxViewer data={data} />}
      {data && isImage && (
        <ImageViewer data={data} mimeType={mimeType!} thumbnail={imageThumbnail} />
      )}
      {data && mimeType !== PDF_MIME && mimeType !== DOCX_MIME && !isImage && (
        <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
      )}
    </div>
  )
}
