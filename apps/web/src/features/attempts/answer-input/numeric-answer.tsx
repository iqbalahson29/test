import { Input } from '@/components/ui/input'
import type { AnswerInputProps } from './types'

export function NumericAnswer({ value, onChange, readOnly }: AnswerInputProps) {
  const num = (value as { value?: number } | null)?.value
  return (
    <Input
      type="number"
      step="any"
      value={num ?? ''}
      disabled={readOnly}
      onChange={(e) =>
        onChange({ value: e.target.value === '' ? null : Number(e.target.value) })
      }
      className="max-w-xs"
    />
  )
}
