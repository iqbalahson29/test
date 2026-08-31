import { useState } from 'react'
import type { FormEvent } from 'react'
import { ALL_QUESTION_TYPES, QuestionType, getQuestionConfigSchema } from '@quiz-platform/shared'
import type { QuestionFormValue } from '../types'
import { emptyConfigFor, emptyOptionsFor } from './config-defaults'
import { QuestionAttachmentField } from './question-attachment-field'
import { QuestionTypeFields } from './question-type-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function QuestionForm({
  quizId,
  questionId,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  quizId: string
  questionId?: string
  initial?: QuestionFormValue
  onSubmit: (value: QuestionFormValue) => void
  onCancel: () => void
  submitting: boolean
}) {
  const isNew = !initial
  const [type, setType] = useState<QuestionType>(initial?.type ?? QuestionType.MCQ_SINGLE)
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [points, setPoints] = useState(initial?.points ?? '1')
  const [config, setConfig] = useState<Record<string, unknown>>(
    initial?.config ?? emptyConfigFor(type),
  )
  const [options, setOptions] = useState(initial?.options ?? emptyOptionsFor(type))
  const [attachment, setAttachment] = useState<QuestionFormValue['attachment']>(
    initial?.attachment ?? null,
  )
  const [error, setError] = useState<string | null>(null)

  const onTypeChange = (nextType: QuestionType) => {
    setType(nextType)
    setConfig(emptyConfigFor(nextType))
    setOptions(emptyOptionsFor(nextType))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const schema = getQuestionConfigSchema(type)
    const parsed = schema.safeParse(config)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid configuration')
      return
    }
    if (!Number.isFinite(Number(points)) || Number(points) < 0) {
      setError('Points must be a non-negative number')
      return
    }

    onSubmit({ type, prompt, points, config: parsed.data, options, attachment })
  }

  return (
    <Card className="rounded-md">
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="question-type">Type</Label>
              <Select
                value={type}
                disabled={!isNew}
                onValueChange={(v) => onTypeChange(v as QuestionType)}
              >
                <SelectTrigger id="question-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="question-points">Points</Label>
              <Input
                id="question-points"
                type="number"
                min="0"
                step="0.5"
                required
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-prompt">Prompt</Label>
            <Textarea
              id="question-prompt"
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
            />
          </div>

          <QuestionTypeFields
            type={type}
            config={config}
            onChange={setConfig}
            options={options}
            onOptionsChange={setOptions}
          />

          <QuestionAttachmentField
            quizId={quizId}
            questionId={questionId}
            value={attachment}
            onChange={setAttachment}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save question'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
