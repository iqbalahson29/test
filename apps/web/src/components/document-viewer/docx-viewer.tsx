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
    <div
      className="max-w-none space-y-2 rounded-md border border-gray-200 bg-white p-4 text-[13.5px] leading-relaxed text-gray-800 select-none [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
      onContextMenu={(e) => e.preventDefault()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
