import { Plus, X } from 'lucide-react'
import type { ConfigEditorProps } from './config-editor-props'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ShortTextConfig {
  acceptedAnswers: string[]
  caseSensitive: boolean
}

export function ShortTextEditor({ config, onChange }: ConfigEditorProps) {
  const value = config as unknown as ShortTextConfig
  const answers = value.acceptedAnswers ?? ['']

  const setAnswer = (i: number, v: string) => {
    const next = [...answers]
    next[i] = v
    onChange({ ...value, acceptedAnswers: next })
  }
  const addAnswer = () => onChange({ ...value, acceptedAnswers: [...answers, ''] })
  const removeAnswer = (i: number) =>
    onChange({ ...value, acceptedAnswers: answers.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-2">
      <Label>Accepted answers</Label>
      {answers.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="text"
            required
            value={a}
            onChange={(e) => setAnswer(i, e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeAnswer(i)}
            disabled={answers.length <= 1}
            aria-label="Remove answer"
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addAnswer}>
        <Plus />
        Add accepted answer
      </Button>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={value.caseSensitive ?? false}
          onCheckedChange={(checked) => onChange({ ...value, caseSensitive: checked === true })}
        />
        Case sensitive
      </Label>
    </div>
  )
}
