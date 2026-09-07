import { DocumentViewer } from '@/components/document-viewer/document-viewer'
import { MathText } from '@/components/math/math-text'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { AnswerInputProps } from './types'

export function McqMultiAnswer({ question, value, onChange, readOnly, attemptId }: AnswerInputProps) {
  const selected = (value as { optionIds?: string[] } | null)?.optionIds ?? []
  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id]
    onChange({ optionIds: next })
  }
  return (
    <div className="space-y-2">
      {question.options.map((o) => (
        <Label key={o.id} className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={selected.includes(o.id)}
            disabled={readOnly}
            onCheckedChange={() => toggle(o.id)}
          />
          <MathText text={o.text} />
          {o.imageFilename && (
            <DocumentViewer
              mimeType={o.imageMimeType}
              filename={o.imageFilename}
              path={`/attempts/${attemptId}/questions/${question.id}/options/${o.id}/image-url`}
              imageThumbnail
            />
          )}
        </Label>
      ))}
    </div>
  )
}
