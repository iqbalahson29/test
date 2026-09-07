import { unzipSync } from 'fflate'

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function guessImageMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? (MIME_BY_EXTENSION[ext] ?? null) : null
}

/** Unzips a browser-uploaded zip of images into a lookup keyed by lowercased
 * basename (directory prefixes inside the zip are ignored, so "images/q1.png"
 * and "Q1.PNG" both resolve under "q1.png") — matches how an Excel import's
 * "Image filename" column references a file by name only. */
export function unzipImagesByFilename(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const entries = unzipSync(new Uint8Array(buffer))
  const byFilename = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('/')) continue // directory entry
    const basename = path.split('/').pop() ?? path
    byFilename.set(basename.toLowerCase(), data)
  }
  return byFilename
}
