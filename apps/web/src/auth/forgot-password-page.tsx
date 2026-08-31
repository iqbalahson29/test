import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ClipboardCheck, Users } from 'lucide-react'
import { ApiError, apiPost } from '../lib/api-client'
import { AuthLayout } from './auth-layout'
import { validateEmail } from './validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const features = [
  { icon: ClipboardCheck, text: 'Build quizzes with auto-graded and open-ended questions' },
  { icon: BarChart3, text: 'Track every attempt with results and a full audit trail' },
  { icon: Users, text: 'Invite teachers and students and manage roles in seconds' },
]

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const validation = validateEmail(email)
    setEmailError(validation)
    if (validation) return
    setSubmitting(true)
    try {
      await apiPost('/auth/forgot-password', { email })
      // Always shown regardless of whether the email matched an account, so
      // this page can't be used to enumerate who has an account.
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Test Platform"
      title="Teach, test, and track, all in one workspace"
      subtitle="Sign in to build quizzes, grade attempts, and see how your class is doing at a glance."
      features={features}
    >
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Reset your password</h2>
          <p className="text-sm text-muted-foreground">
            Enter your account email and we&apos;ll send you a link to reset your password.
          </p>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  If an account exists for {email}, we&apos;ve sent a password reset link to it.
                  Check your inbox.
                </AlertDescription>
              </Alert>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  aria-invalid={!!emailError}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailError(validateEmail(email))}
                />
                {emailError && <p className="text-xs text-destructive">{emailError}</p>}
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
