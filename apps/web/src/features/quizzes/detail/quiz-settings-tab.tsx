import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api-client'
import { quizzesApi } from '../api'
import type { QuizDetail } from '../types'
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
  const [timeLimitSec, setTimeLimitSec] = useState(
    quiz.timeLimitSec != null ? String(quiz.timeLimitSec) : '',
  )
  const [maxAttempts, setMaxAttempts] = useState(
    quiz.maxAttempts != null ? String(quiz.maxAttempts) : '',
  )
  const [passMarkPercent, setPassMarkPercent] = useState(quiz.passMarkPercent ?? '')
  const [shuffleQuestions, setShuffleQuestions] = useState(quiz.shuffleQuestions)
  const [shuffleOptions, setShuffleOptions] = useState(quiz.shuffleOptions)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      quizzesApi.update(quiz.id, {
        title,
        description: description || undefined,
        timeLimitSec: timeLimitSec ? Number(timeLimitSec) : undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        passMarkPercent: passMarkPercent ? Number(passMarkPercent) : undefined,
        shuffleQuestions,
        shuffleOptions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quiz.id] })
      queryClient.invalidateQueries({ queryKey: ['quizzes'] })
      setError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not save settings'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="settings-time-limit">Time limit (sec)</Label>
                <Input
                  id="settings-time-limit"
                  type="number"
                  min="1"
                  value={timeLimitSec}
                  onChange={(e) => setTimeLimitSec(e.target.value)}
                  placeholder="No limit"
                />
              </div>
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
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shuffleQuestions}
                  onCheckedChange={(v) => setShuffleQuestions(v === true)}
                />
                Shuffle question order for each student
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shuffleOptions}
                  onCheckedChange={(v) => setShuffleOptions(v === true)}
                />
                Shuffle answer options for each student
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
