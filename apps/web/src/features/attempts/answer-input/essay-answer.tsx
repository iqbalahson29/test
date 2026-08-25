import { Textarea } from '@/components/ui/textarea'
import type { AnswerInputProps } from './types'

interface EssayConfig {
  minWords?: number
  maxWords?: number
}

export function EssayAnswer({ question, value, onChange, readOnly }: AnswerInputProps) {
  const text = (value as { text?: string } | null)?.text ?? ''
  const config = question.config as EssayConfig
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length

  return (
    <div>
      <Textarea
        value={text}
        disabled={readOnly}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={6}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {wordCount} word{wordCount === 1 ? '' : 's'}
        {(config.minWords || config.maxWords) && (
          <>
            {' '}
            (
            {config.minWords && `min ${config.minWords}`}
            {config.minWords && config.maxWords && ', '}
            {config.maxWords && `max ${config.maxWords}`}
            )
          </>
        )}
      </p>
    </div>
  )
}
