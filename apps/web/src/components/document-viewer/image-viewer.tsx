import { useEffect, useState } from 'react'

/** Renders image bytes (from a fetched ArrayBuffer or a local File) as an
 * `<img>` via a short-lived object URL. */
export function ImageViewer({
  data,
  mimeType,
  thumbnail,
}: {
  data: ArrayBuffer
  mimeType: string
  /** Small fixed-size square preview (for an answer option) instead of the
   * default large inline preview (for a question prompt). */
  thumbnail?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const blobUrl = URL.createObjectURL(new Blob([data], { type: mimeType }))
    setUrl(blobUrl)
    return () => URL.revokeObjectURL(blobUrl)
  }, [data, mimeType])

  if (!url) return null
  return (
    <img
      src={url}
      alt=""
      className={
        thumbnail
          ? 'size-12 rounded-md border object-cover'
          : 'max-h-[480px] max-w-full rounded-md border object-contain'
      }
    />
  )
}
