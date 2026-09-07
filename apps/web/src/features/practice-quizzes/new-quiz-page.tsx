import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { QUIZ_MODULE_SEQUENCE, QUIZ_MODULE_LABELS } from '@quiz-platform/shared'
import { ApiError } from '../../lib/api-client'
import { practiceQuizzesApi } from './api'
import type { BankDifficultyRatio, BankModuleTargets, PracticeQuizMode } from './types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const DEFAULT_TARGETS: BankModuleTargets = {
  RW_MODULE_1: 27,
  RW_MODULE_2: 27,
  MATH_MODULE_1: 22,
  MATH_MODULE_2: 22,
}

const DEFAULT_RATIO: BankDifficultyRatio = { EASY: 40, MEDIUM: 40, HARD: 20 }

export function NewPracticeQuizPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [maxAttempts, setMaxAttempts] = useState('')
  const [passMarkPercent, setPassMarkPercent] = useState('')
  const [mode, setMode] = useState<PracticeQuizMode>('FIXED')
  const [targets, setTargets] = useState<BankModuleTargets>(DEFAULT_TARGETS)
  const [ratio, setRatio] = useState<BankDifficultyRatio>(DEFAULT_RATIO)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ratioSum = ratio.EASY + ratio.MEDIUM + ratio.HARD

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'BANK' && ratioSum !== 100) {
      setError(`The easy/medium/hard split must add up to 100 (currently ${ratioSum})`)
      return
    }
    setSubmitting(true)
    try {
      const quiz = await practiceQuizzesApi.create({
        title,
        description: description || undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        passMarkPercent: passMarkPercent ? Number(passMarkPercent) : undefined,
        mode,
        bankModuleTargets: mode === 'BANK' ? targets : undefined,
        bankDifficultyRatio: mode === 'BANK' ? ratio : undefined,
      })
      navigate(`/teacher/practice-quizzes/${quiz.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create quiz')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-[17px] font-bold text-gray-900">New practice quiz</h1>
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            Every practice quiz follows the digital SAT's 4-module structure (Reading &amp;
            Writing Module 1 &amp; 2, Math Module 1 &amp; 2) with fixed timing per module —
            there's no separate time limit to set here.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="maxAttempts">Max attempts</Label>
                <Input
                  id="maxAttempts"
                  type="number"
                  min="1"
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                  placeholder="unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passMarkPercent">Pass mark %</Label>
                <Input
                  id="passMarkPercent"
                  type="number"
                  min="0"
                  max="100"
                  value={passMarkPercent}
                  onChange={(e) => setPassMarkPercent(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Question source</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as PracticeQuizMode)}
                className="gap-2"
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value="FIXED" className="mt-0.5" />
                  <span>
                    <span className="block font-medium text-gray-800">Fixed question set</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      You author every question; every student sees the same set.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value="BANK" className="mt-0.5" />
                  <span>
                    <span className="block font-medium text-gray-800">
                      Random from question bank
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      Upload a large tagged-difficulty pool — each attempt draws its own random
                      set, and manual grading (essay, file upload) isn't available.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {mode === 'BANK' && (
              <div className="space-y-4 rounded-md border bg-muted/30 p-3">
                <div className="space-y-2">
                  <Label>Questions drawn per module</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {QUIZ_MODULE_SEQUENCE.map((m) => (
                      <div key={m} className="space-y-1">
                        <Label htmlFor={`target-${m}`} className="text-[12px] font-normal text-muted-foreground">
                          {QUIZ_MODULE_LABELS[m]}
                        </Label>
                        <Input
                          id={`target-${m}`}
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
                        <Label htmlFor={`ratio-${level}`} className="text-[12px] font-normal text-muted-foreground">
                          {level.charAt(0) + level.slice(1).toLowerCase()} %
                        </Label>
                        <Input
                          id={`ratio-${level}`}
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
                <p className="text-[12px] text-muted-foreground">
                  These can be changed later from the Settings tab while the quiz is still a
                  draft. You'll need enough questions of each difficulty in each module before
                  you can publish.
                </p>
              </div>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create quiz'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
