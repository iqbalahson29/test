import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AnswerInputProps } from './types'

interface FillBlankConfig {
  blankCount: number
}

export function FillBlankAnswer({ question, value, onChange, readOnly }: AnswerInputProps) {
  const config = question.config as unknown as FillBlankConfig
  const answers = (value as { answers?: string[] } | null)?.answers ?? []

  const setAnswer = (i: number, v: string) => {
    const next = [...answers]
    while (next.length < config.blankCount) next.push('')
    next[i] = v
    onChange({ answers: next })
  }

  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: config.blankCount }, (_, i) => (
        <div key={i} className="space-y-1">
          <Label className="text-muted-foreground">Blank {i + 1}</Label>
          <Input
            type="text"
            value={answers[i] ?? ''}
            disabled={readOnly}
            onChange={(e) => setAnswer(i, e.target.value)}
            className="w-32"
          />
        </div>
      ))}
    </div>
  )
}
