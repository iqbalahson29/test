import { useEffect, useState } from 'react'

export function DocxViewer({ data }: { data: ArrayBuffer }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function convert() {
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({ arrayBuffer: data })
      if (!cancelled) setHtml(result.value)
    }
    convert().catch(() => {
      if (!cancelled) setError('Could not render this document.')
    })
    return () => {
      cancelled = true
    }
  }, [data])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!html) return <p className="text-sm text-muted-foreground">Rendering document…</p>

  return (
    <iframe
      title="Document preview"
      sandbox=""
      referrerPolicy="no-referrer"
      className="h-[70vh] w-full rounded-md border bg-white"
      srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{font:14px/1.6 sans-serif;padding:20px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px}img{max-width:100%}a{pointer-events:none}</style></head><body>${html}</body></html>`}
    />
  )
}
