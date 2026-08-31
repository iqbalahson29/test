import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Eye, EyeOff, Loader2, Paperclip, X } from 'lucide-react'
import { questionsApi } from '../api'
import type { QuestionAttachment } from '../types'
import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ACCEPTED_MIME = [PDF_MIME, DOCX_MIME]

export function QuestionAttachmentField({
  quizId,
  questionId,
  value,
  onChange,
}: {
  quizId: string
  questionId?: string
  value: QuestionAttachment | null
  onChange: (value: QuestionAttachment | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)

    if (!ACCEPTED_MIME.includes(file.type)) {
      setError('Only PDF and DOCX files are supported.')
      return
    }

    setUploading(true)
    try {
      const { uploadUrl, attachmentKey } = await questionsApi.getAttachmentUploadUrl(
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
      setPreviewing(true)
    } catch {
      setError('Could not upload file. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Reference document (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Attach a PDF or DOCX for students to view alongside this question. They can view it but
        not download it.
      </p>

      {value ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{value.filename}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreviewing((v) => !v)}
            >
              {previewing ? <EyeOff /> : <Eye />}
              {previewing ? 'Hide' : 'Preview'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove attachment"
              onClick={() => {
                onChange(null)
                setPreviewing(false)
              }}
            >
              <X />
            </Button>
          </div>
          {previewing && (
            <DocumentViewer
              mimeType={value.mimeType}
              filename={value.filename}
              file={value.file}
              path={
                !value.file && questionId
                  ? questionsApi.attachmentUrlPath(quizId, questionId)
                  : undefined
              }
            />
          )}
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileSelect}
            disabled={uploading}
            className="hidden"
          />
          <Button
            type="button"
            className="w-36"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading && <Loader2 className="animate-spin" />}
            {uploading ? 'Uploading…' : 'Attach document'}
          </Button>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
