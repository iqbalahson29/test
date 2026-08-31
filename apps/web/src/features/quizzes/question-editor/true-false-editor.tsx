import type { OptionInput } from '../types'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function TrueFalseEditor({
  options,
  onChange,
}: {
  options: OptionInput[]
  onChange: (options: OptionInput[]) => void
}) {
  const correctIndex = options.findIndex((o) => o.isCorrect)
  return (
    <div className="space-y-2">
      <Label>Correct answer</Label>
      <RadioGroup
        value={correctIndex >= 0 ? String(correctIndex) : undefined}
        onValueChange={(v) => {
          const i = Number(v)
          onChange([
            { ...options[0], text: 'True', isCorrect: i === 0 },
            { ...options[1], text: 'False', isCorrect: i === 1 },
          ])
        }}
      >
        {['True', 'False'].map((label, i) => (
          <Label key={label} className="flex items-center gap-2 font-normal">
            <RadioGroupItem value={String(i)} />
            {label}
          </Label>
        ))}
      </RadioGroup>
    </div>
  )
}
