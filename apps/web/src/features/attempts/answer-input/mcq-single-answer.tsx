import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { AnswerInputProps } from './types'

export function McqSingleAnswer({ question, value, onChange, readOnly }: AnswerInputProps) {
  const selected = (value as { optionId?: string } | null)?.optionId
  return (
    <RadioGroup value={selected} onValueChange={(v) => onChange({ optionId: v })}>
      {question.options.map((o) => (
        <Label key={o.id} className="flex items-center gap-2 font-normal">
          <RadioGroupItem value={o.id} disabled={readOnly} />
          {o.text}
        </Label>
      ))}
    </RadioGroup>
  )
}
