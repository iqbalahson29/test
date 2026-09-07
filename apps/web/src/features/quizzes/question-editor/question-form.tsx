import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ALL_QUESTION_DIFFICULTIES,
  ALL_QUESTION_TYPES,
  QUIZ_MODULE_SEQUENCE,
  QUIZ_MODULE_LABELS,
  QuestionType,
  QuizModule,
  getQuestionConfigSchema,
} from '@quiz-platform/shared'
import type { QuestionDifficulty } from '@quiz-platform/shared'
import type { QuestionFormValue } from '../types'
import { emptyConfigFor, emptyOptionsFor } from './config-defaults'
import { QuestionAttachmentField } from './question-attachment-field'
import { QuestionImageField } from './question-image-field'
import { QuestionTypeFields } from './question-type-fields'
import { DIFFICULTY_LABELS } from '@/components/difficulty-badge'
import { MathTextarea } from '@/components/math/math-textarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DIFFICULTY_UNSET = 'UNSET'

export function QuestionForm({
  quizId,
  questionId,
  initial,
  defaultModule,
  onSubmit,
  onCancel,
  submitting,
}: {
  quizId: string
  questionId?: string
  initial?: QuestionFormValue
  /** Module a freshly-added question defaults to — e.g. whichever module
   * section was active when "Add question" was clicked. Ignored when
   * editing an existing question. */
  defaultModule?: QuizModule
  onSubmit: (value: QuestionFormValue) => void
  onCancel: () => void
  submitting: boolean
}) {
  const isNew = !initial
  const [module, setModule] = useState<QuizModule>(
    initial?.module ?? defaultModule ?? QUIZ_MODULE_SEQUENCE[0],
  )
  const [type, setType] = useState<QuestionType>(initial?.type ?? QuestionType.MCQ_SINGLE)
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [points, setPoints] = useState(initial?.points ?? '1')
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | null>(initial?.difficulty ?? null)
  const [config, setConfig] = useState<Record<string, unknown>>(
    initial?.config ?? emptyConfigFor(type),
  )
  const [options, setOptions] = useState(initial?.options ?? emptyOptionsFor(type))
  const [attachment, setAttachment] = useState<QuestionFormValue['attachment']>(
    initial?.attachment ?? null,
  )
  const [image, setImage] = useState<QuestionFormValue['image']>(initial?.image ?? null)
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

    onSubmit({
      type,
      module,
      prompt,
      points,
      config: parsed.data,
      difficulty,
      options,
      attachment,
      image,
    })
  }

  return (
    <Card className="rounded-md">
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="question-module">Module</Label>
              <Select value={module} onValueChange={(v) => setModule(v as QuizModule)}>
                <SelectTrigger id="question-module" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUIZ_MODULE_SEQUENCE.map((m) => (
                    <SelectItem key={m} value={m}>
                      {QUIZ_MODULE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="question-difficulty">Difficulty (optional)</Label>
              <Select
                value={difficulty ?? DIFFICULTY_UNSET}
                onValueChange={(v) =>
                  setDifficulty(v === DIFFICULTY_UNSET ? null : (v as QuestionDifficulty))
                }
              >
                <SelectTrigger id="question-difficulty" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DIFFICULTY_UNSET}>Not set</SelectItem>
                  {ALL_QUESTION_DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-prompt">Prompt</Label>
            <MathTextarea
              id="question-prompt"
              required
              value={prompt}
              onChange={setPrompt}
              rows={2}
            />
          </div>

          <QuestionTypeFields
            type={type}
            config={config}
            onChange={setConfig}
            options={options}
            onOptionsChange={setOptions}
            quizId={quizId}
            questionId={questionId}
          />

          <QuestionImageField
            quizId={quizId}
            questionId={questionId}
            value={image}
            onChange={setImage}
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
