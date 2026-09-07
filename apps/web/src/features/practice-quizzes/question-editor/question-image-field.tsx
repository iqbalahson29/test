import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { practiceQuestionsApi } from '../api'
import type { QuestionImage } from '../types'
import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export function QuestionImageField({
  quizId,
  questionId,
  value,
  onChange,
}: {
  quizId: string
  questionId?: string
  value: QuestionImage | null
  onChange: (value: QuestionImage | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)

    if (!ACCEPTED_MIME.includes(file.type)) {
      setError('Only PNG, JPEG, GIF, and WEBP images are supported.')
      return
    }

    setUploading(true)
    try {
      const { uploadUrl, attachmentKey } = await practiceQuestionsApi.getAttachmentUploadUrl(
        quizId,
        file.name,
        file.type,
      )
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) throw new Error('Upload failed')
      onChange({ key: attachmentKey, filename: file.name, mimeType: file.type, file })
    } catch {
      setError('Could not upload image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Question image (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Shown inline with the prompt — for a diagram, chart, or passage image.
      </p>

      {value ? (
        <div className="relative inline-block">
          <DocumentViewer
            mimeType={value.mimeType}
            filename={value.filename}
            file={value.file}
            path={
              !value.file && questionId
                ? practiceQuestionsApi.imageUrlPath(quizId, questionId)
                : undefined
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove image"
            className="absolute top-1 right-1 bg-background/80"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
            onChange={onFileSelect}
            disabled={uploading}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-36"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <ImageIcon />}
            {uploading ? 'Uploading…' : 'Add image'}
          </Button>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
