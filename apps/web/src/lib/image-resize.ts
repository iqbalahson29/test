function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

// Downscales to fit within maxDimension (keeping aspect ratio) and
// re-encodes as JPEG so a full-resolution photo doesn't blow past the
// profile API's body-size limits when stored inline as a data: URL.
export async function resizeImageToDataUrl(
  file: File,
  maxDimension = 256,
  quality = 0.85,
): Promise<string> {
  const original = await readAsDataUrl(file)
  const img = await loadImage(original)

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return original

  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}
