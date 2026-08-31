import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, ClipboardCheck, Users } from 'lucide-react'
import { ApiError, apiPost } from '../lib/api-client'
import { AuthLayout } from './auth-layout'
import { PasswordInput, PasswordStrengthMeter } from './password-field'
import { isStrongPassword } from './password-rules'
import { validateConfirmPassword } from './validation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const features = [
  { icon: ClipboardCheck, text: 'Build quizzes with auto-graded and open-ended questions' },
  { icon: BarChart3, text: 'Track every attempt with results and a full audit trail' },
  { icon: Users, text: 'Invite teachers and students and manage roles in seconds' },
]

interface FieldErrors {
  password?: string
  confirmPassword?: string
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const validate = (): boolean => {
    const errors: FieldErrors = {
      password: isStrongPassword(password) ? undefined : 'Password does not meet the requirements below',
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    }
    setFieldErrors(errors)
    return !errors.password && !errors.confirmPassword
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('This reset link is missing its token. Request a new one.')
      return
    }
    if (!validate()) return
    setSubmitting(true)
    try {
      await apiPost('/auth/reset-password', { token, newPassword: password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password')
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
          <h2 className="text-base font-semibold">Choose a new password</h2>
          <p className="text-sm text-muted-foreground">
            You&apos;ll be signed out everywhere else once this is done.
          </p>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Your password has been reset. You can now sign in with your new password.
                </AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                Go to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {!token && (
                <Alert variant="destructive">
                  <AlertDescription>
                    This link is missing its reset token.{' '}
                    <Link to="/forgot-password" className="font-medium underline">
                      Request a new one
                    </Link>
                    .
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  invalid={!!fieldErrors.password}
                  onChange={setPassword}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: isStrongPassword(password)
                        ? undefined
                        : 'Password does not meet the requirements below',
                    }))
                  }
                />
                <PasswordStrengthMeter password={password} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  invalid={!!fieldErrors.confirmPassword}
                  onChange={setConfirmPassword}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword: validateConfirmPassword(password, confirmPassword),
                    }))
                  }
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                )}
              </div>
              <Button type="submit" disabled={submitting || !token} className="w-full">
                {submitting ? 'Resetting…' : 'Reset password'}
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
