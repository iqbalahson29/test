import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../lib/api-client'
import { quizzesApi } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function NewQuizPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [timeLimitSec, setTimeLimitSec] = useState('')
  const [maxAttempts, setMaxAttempts] = useState('')
  const [passMarkPercent, setPassMarkPercent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const quiz = await quizzesApi.create({
        title,
        description: description || undefined,
        timeLimitSec: timeLimitSec ? Number(timeLimitSec) : undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
        passMarkPercent: passMarkPercent ? Number(passMarkPercent) : undefined,
      })
      navigate(`/teacher/quizzes/${quiz.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create quiz')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-[17px] font-bold text-gray-900">New quiz</h1>
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            Just the basics for now — once it's created, you'll land on the quiz page where you
            can design and add questions whenever you're ready.
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="timeLimitSec">Time limit (sec)</Label>
                <Input
                  id="timeLimitSec"
                  type="number"
                  min="1"
                  value={timeLimitSec}
                  onChange={(e) => setTimeLimitSec(e.target.value)}
                />
              </div>
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
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create quiz'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
