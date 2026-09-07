import { MathText } from '@/components/math/math-text'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AnswerInputProps } from './types'

interface MatchingConfig {
  leftItems: string[]
  rightItems: string[]
}
interface Selection {
  left: string
  right: string
}

const UNSELECTED = '__unmatched__'

export function MatchingAnswer({ question, value, onChange, readOnly }: AnswerInputProps) {
  const config = question.config as unknown as MatchingConfig
  const selections = (value as { selections?: Selection[] } | null)?.selections ?? []
  const selectedFor = (left: string) =>
    selections.find((s) => s.left === left)?.right ?? ''

  const setSelection = (left: string, right: string) => {
    const next = selections.filter((s) => s.left !== left)
    if (right) next.push({ left, right })
    onChange({ selections: next })
  }

  return (
    <div className="space-y-2">
      {config.leftItems.map((left) => (
        <div key={left} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 text-foreground">
            <MathText text={left} />
          </span>
          <Select
            value={selectedFor(left) || UNSELECTED}
            disabled={readOnly}
            onValueChange={(v) => setSelection(left, v === UNSELECTED ? '' : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a match…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSELECTED}>Select a match…</SelectItem>
              {config.rightItems.map((right) => (
                <SelectItem key={right} value={right}>
                  <MathText text={right} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
