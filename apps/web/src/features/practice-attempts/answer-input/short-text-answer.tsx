import { Input } from '@/components/ui/input'
import type { AnswerInputProps } from './types'

export function ShortTextAnswer({ value, onChange, readOnly }: AnswerInputProps) {
  const text = (value as { text?: string } | null)?.text ?? ''
  return (
    <Input
      type="text"
      value={text}
      disabled={readOnly}
      onChange={(e) => onChange({ text: e.target.value })}
    />
  )
}
