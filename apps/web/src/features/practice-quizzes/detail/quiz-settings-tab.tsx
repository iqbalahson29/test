import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { QUIZ_MODULE_SEQUENCE, QUIZ_MODULE_LABELS, QUIZ_MODULE_TIME_LIMIT_SEC } from '@quiz-platform/shared'
import { ApiError } from '../../../lib/api-client'
import { practiceQuizzesApi } from '../api'
import type { BankDifficultyRatio, BankModuleTargets, QuizDetail } from '../types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function QuizSettingsTab({ quiz }: { quiz: QuizDetail }) {
  const queryClient = useQueryClient()
  const editable = quiz.status === 'DRAFT'

  const [title, setTitle] = useState(quiz.title)
  const [description, setDescription] = useState(quiz.description ?? '')
  const [maxAttempts, setMaxAttempts] = useState(
    quiz.maxAttempts != null ? String(quiz.maxAttempts) : '',
  )
  const [passMarkPercent, setPassMarkPercent] = useState(quiz.passMarkPercent ?? '')
  const [shuffleQuestions, setShuffleQuestions] = useState(quiz.shuffleQuestions)
  const [shuffleOptions, setShuffleOptions] = useState(quiz.shuffleOptions)
  const [showDifficultyToStudents, setShowDifficultyToStudents] = useState(
    quiz.showDifficultyToStudents,
  )
  const isBankMode = quiz.mode === 'BANK'
  const [targets, setTargets] = useState<BankModuleTargets>(
    quiz.bankModuleTargets ?? { RW_MODULE_1: 27, RW_MODULE_2: 27, MATH_MODULE_1: 22, MATH_MODULE_2: 22 },
  )
  const [ratio, setRatio] = useState<BankDifficultyRatio>(
    quiz.bankDifficultyRatio ?? { EASY: 40, MEDIUM: 40, HARD: 20 },
  )
  const ratioSum = ratio.EASY + ratio.MEDIUM + ratio.HARD
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      practiceQuizzesApi.update(quiz.id, {
        title,
        description: description || undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        passMarkPercent: passMarkPercent ? Number(passMarkPercent) : undefined,
        shuffleQuestions,
        shuffleOptions,
        showDifficultyToStudents,
        bankModuleTargets: isBankMode ? targets : undefined,
        bankDifficultyRatio: isBankMode ? ratio : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-quiz', quiz.id] })
      queryClient.invalidateQueries({ queryKey: ['practice-quizzes'] })
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not save settings'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (isBankMode && ratioSum !== 100) {
      setError(`The easy/medium/hard split must add up to 100 (currently ${ratioSum})`)
      return
    }
    mutation.mutate()
  }

  return (
    <Card className="rounded-md">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        {!editable && (
          <p className="mt-1 text-sm text-muted-foreground">
            Unpublish this quiz to change its settings.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <fieldset disabled={!editable} className="space-y-4 disabled:opacity-60">
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="settings-title">Title</Label>
              <Input id="settings-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-description">Description</Label>
              <Textarea
                id="settings-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Timing is fixed to match the real SAT</p>
              <ul className="mt-1 list-inside list-disc">
                {QUIZ_MODULE_SEQUENCE.map((m) => (
                  <li key={m}>
                    {QUIZ_MODULE_LABELS[m]}: {Math.round(QUIZ_MODULE_TIME_LIMIT_SEC[m] / 60)} min
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                The on-screen calculator is available only during the Math modules.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="settings-max-attempts">Max attempts</Label>
                <Input
                  id="settings-max-attempts"
                  type="number"
                  min="1"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-pass-mark">Pass mark %</Label>
                <Input
                  id="settings-pass-mark"
                  type="number"
                  min="0"
                  max="100"
                  value={passMarkPercent}
                  onChange={(e) => setPassMarkPercent(e.target.value)}
                />
              </div>
            </div>
            {isBankMode && (
              <div className="space-y-4 rounded-md border bg-muted/30 p-3">
                <div className="space-y-2">
                  <Label>Questions drawn per module</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {QUIZ_MODULE_SEQUENCE.map((m) => (
                      <div key={m} className="space-y-1">
                        <Label htmlFor={`settings-target-${m}`} className="text-[12px] font-normal text-muted-foreground">
                          {QUIZ_MODULE_LABELS[m]}
                        </Label>
                        <Input
                          id={`settings-target-${m}`}
                          type="number"
                          min="1"
                          value={targets[m]}
                          onChange={(e) =>
                            setTargets((prev) => ({ ...prev, [m]: Number(e.target.value) || 0 }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>
                    Difficulty split{' '}
                    <span className={ratioSum === 100 ? 'text-muted-foreground' : 'text-destructive'}>
                      ({ratioSum}% of 100%)
                    </span>
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['EASY', 'MEDIUM', 'HARD'] as const).map((level) => (
                      <div key={level} className="space-y-1">
                        <Label htmlFor={`settings-ratio-${level}`} className="text-[12px] font-normal text-muted-foreground">
                          {level.charAt(0) + level.slice(1).toLowerCase()} %
                        </Label>
                        <Input
                          id={`settings-ratio-${level}`}
                          type="number"
                          min="0"
                          max="100"
                          value={ratio[level]}
                          onChange={(e) =>
                            setRatio((prev) => ({ ...prev, [level]: Number(e.target.value) || 0 }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {!isBankMode && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={shuffleQuestions}
                    onCheckedChange={(v) => setShuffleQuestions(v === true)}
                  />
                  Shuffle question order for each student
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shuffleOptions}
                  onCheckedChange={(v) => setShuffleOptions(v === true)}
                />
                Shuffle answer options for each student
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showDifficultyToStudents}
                  onCheckedChange={(v) => setShowDifficultyToStudents(v === true)}
                />
                Show each question's difficulty level to students
              </label>
            </div>
            {editable && (
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving…' : 'Save settings'}
                </Button>
                {saved && <span className="text-sm text-emerald-600">Saved</span>}
              </div>
            )}
          </form>
        </fieldset>
      </CardContent>
    </Card>
  )
}
