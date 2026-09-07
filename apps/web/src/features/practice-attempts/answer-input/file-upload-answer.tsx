import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { practiceAttemptsApi } from '../api'
import { Button } from '@/components/ui/button'
import type { AnswerInputProps } from './types'

interface FileUploadConfig {
  allowedExtensions?: string[]
  maxSizeMb: number
}

function filenameFromKey(key: string): string {
  const lastSegment = key.split('/').pop() ?? key
  // Keys look like "<uuid>-<original filename>" — drop the uuid prefix for display.
  const dashIndex = lastSegment.indexOf('-')
  return dashIndex >= 0 && lastSegment.length > dashIndex + 1
    ? lastSegment.slice(dashIndex + 1)
    : lastSegment
}

export function FileUploadAnswer({
  question,
  value,
  onChange,
  readOnly,
  attemptId,
}: AnswerInputProps) {
  const config = question.config as unknown as FileUploadConfig
  const currentFileKey = value as string | null
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowed = config.allowedExtensions?.map((x) => x.toLowerCase())
    if (allowed && allowed.length > 0 && (!ext || !allowed.includes(ext))) {
      setError(`File type not allowed. Allowed: ${config.allowedExtensions!.join(', ')}`)
      return
    }
    if (file.size > config.maxSizeMb * 1024 * 1024) {
      setError(`File too large. Max ${config.maxSizeMb}MB`)
      return
    }

    setUploading(true)
    try {
      const { uploadUrl, fileKey } = await practiceAttemptsApi.getUploadUrl(
        attemptId,
        question.id,
        file.name,
        file.type || 'application/octet-stream',
      )
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error('Upload failed')
      }
      onChange(fileKey)
    } catch {
      setError('Could not upload file. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {currentFileKey && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Uploaded: {filenameFromKey(currentFileKey)}
        </p>
      )}
      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            onChange={onFileSelect}
            disabled={uploading}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? 'Uploading…' : currentFileKey ? 'Replace file' : 'Choose file'}
          </Button>
          {config.allowedExtensions && config.allowedExtensions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Allowed: {config.allowedExtensions.join(', ')} — max {config.maxSizeMb}MB
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
      {readOnly && !currentFileKey && (
        <p className="text-sm text-muted-foreground">No file uploaded.</p>
      )}
    </div>
  )
}
