import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { ApiError, apiPost } from '../lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface RequestForm {
  workspaceName: string
  requesterName: string
  requesterEmail: string
  password: string
}

const emptyForm: RequestForm = {
  workspaceName: '',
  requesterName: '',
  requesterEmail: '',
  password: '',
}

export function RequestWorkspacePage() {
  const [form, setForm] = useState<RequestForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiPost('/tenant-requests', form)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
            <h1 className="text-base font-semibold">Request submitted</h1>
            <p className="text-sm text-muted-foreground">
              A platform admin will review your request. You&apos;ll be able to sign in once
              it&apos;s approved.
            </p>
            <Link to="/login" className="text-sm font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">Quiz Platform</h1>
        </div>
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Request a workspace</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="workspaceName">Workspace name</Label>
                <Input
                  id="workspaceName"
                  required
                  value={form.workspaceName}
                  onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="requesterName">Your name</Label>
                <Input
                  id="requesterName"
                  required
                  value={form.requesterName}
                  onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="requesterEmail">Email</Label>
                <Input
                  id="requesterEmail"
                  type="email"
                  required
                  value={form.requesterEmail}
                  onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Submitting…' : 'Request workspace'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
