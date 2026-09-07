import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { practiceQuestionsApi } from '../api'
import type { OptionInput } from '../types'
import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { MathInput } from '@/components/math/math-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const ACCEPTED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function OptionImageControl({
  quizId,
  questionId,
  optionId,
  option,
  onChange,
}: {
  quizId: string
  questionId?: string
  optionId?: string
  option: OptionInput
  onChange: (patch: Partial<OptionInput>) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasImage = option.imageFile || option.imageKey
  const mimeType = option.imageFile?.type ?? option.imageMimeType ?? null

  const onFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !ACCEPTED_IMAGE_MIME.includes(file.type)) return

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
      onChange({
        imageKey: attachmentKey,
        imageFilename: file.name,
        imageMimeType: file.type,
        imageFile: file,
      })
    } catch {
      // Silently ignored — the option simply keeps its previous image state;
      // the button remains available to retry.
    } finally {
      setUploading(false)
    }
  }

  if (hasImage) {
    return (
      <div className="relative shrink-0">
        <DocumentViewer
          mimeType={mimeType}
          filename={option.imageFilename ?? null}
          file={option.imageFile}
          imageThumbnail
          path={
            !option.imageFile && questionId && optionId
              ? practiceQuestionsApi.optionImageUrlPath(quizId, questionId, optionId)
              : undefined
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove option image"
          className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-background shadow-sm"
          onClick={() =>
            onChange({ imageKey: '', imageFilename: undefined, imageMimeType: undefined, imageFile: undefined })
          }
        >
          <X className="size-3" />
        </Button>
      </div>
    )
  }

  return (
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
        variant="ghost"
        size="icon"
        aria-label="Add option image"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <ImageIcon />}
      </Button>
    </>
  )
}

export function OptionsEditor({
  mode,
  quizId,
  questionId,
  options,
  onChange,
}: {
  mode: 'single' | 'multi'
  /** Needed to upload a per-option image via the same upload-url endpoint
   * used for the question-level image/attachment. */
  quizId: string
  questionId?: string
  options: OptionInput[]
  onChange: (options: OptionInput[]) => void
}) {
  const setText = (i: number, text: string) => {
    const next = [...options]
    next[i] = { ...next[i], text }
    onChange(next)
  }
  const setCorrect = (i: number) => {
    if (mode === 'single') {
      onChange(options.map((o, idx) => ({ ...o, isCorrect: idx === i })))
    } else {
      const next = [...options]
      next[i] = { ...next[i], isCorrect: !next[i].isCorrect }
      onChange(next)
    }
  }
  const patchOption = (i: number, patch: Partial<OptionInput>) => {
    const next = [...options]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  const addOption = () => onChange([...options, { text: '', isCorrect: false }])
  const removeOption = (i: number) => onChange(options.filter((_, idx) => idx !== i))

  const correctIndex = options.findIndex((o) => o.isCorrect)

  const rows = options.map((o, i) => (
    <div key={i} className="flex items-center gap-2">
      {mode === 'single' ? (
        <RadioGroupItem value={String(i)} aria-label={`Mark option ${i + 1} correct`} />
      ) : (
        <Checkbox
          checked={o.isCorrect}
          onCheckedChange={() => setCorrect(i)}
          aria-label={`Mark option ${i + 1} correct`}
        />
      )}
      <MathInput
        required
        value={o.text}
        onChange={(text) => setText(i, text)}
        placeholder="Option text"
      />
      <OptionImageControl
        quizId={quizId}
        questionId={questionId}
        optionId={o.id}
        option={o}
        onChange={(patch) => patchOption(i, patch)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => removeOption(i)}
        disabled={options.length <= 2}
        aria-label="Remove option"
      >
        <X />
      </Button>
    </div>
  ))

  return (
    <div className="space-y-2">
      <Label>Options</Label>
      {mode === 'single' ? (
        <RadioGroup
          value={correctIndex >= 0 ? String(correctIndex) : undefined}
          onValueChange={(v) => setCorrect(Number(v))}
          className="gap-2"
        >
          {rows}
        </RadioGroup>
      ) : (
        <div className="space-y-2">{rows}</div>
      )}
      <Button type="button" className="w-36" onClick={addOption}>
        Add option
      </Button>
    </div>
  )
}
