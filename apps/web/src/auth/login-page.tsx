import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, ClipboardCheck, Users } from 'lucide-react'
import { ApiError } from '../lib/api-client'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'
import { ChooseWorkspaceStep } from './choose-workspace-step'
import { PasswordInput } from './password-field'
import { consumePostAuthRedirect } from './post-auth-redirect'
import { validateEmail, validateRequired } from './validation'
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

interface FieldErrors {
  email?: string
  password?: string
}

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = (): boolean => {
    const errors: FieldErrors = {
      email: validateEmail(email),
      password: validateRequired(password, 'Password'),
    }
    setFieldErrors(errors)
    return !errors.email && !errors.password
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await login(email, password)
      // 'choosing-workspace' stays on this page — the branch below renders
      // the picker instead of navigating away.
      if (result !== 'choosing-workspace') {
        navigate(consumePostAuthRedirect() ?? '/', { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
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
      {status === 'choosing-workspace' ? (
        <ChooseWorkspaceStep />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Sign in to your workspace</h2>
            <p className="text-sm text-muted-foreground">
              Enter your email and password to continue.
            </p>
          </CardHeader>
          <CardContent>
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
                  aria-invalid={!!fieldErrors.email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setFieldErrors((prev) => ({ ...prev, email: validateEmail(email) }))}
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  invalid={!!fieldErrors.password}
                  onChange={setPassword}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: validateRequired(password, 'Password'),
                    }))
                  }
                />
                {fieldErrors.password && (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                )}
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Need a workspace?{' '}
                <Link to="/request-workspace" className="font-medium text-primary hover:underline">
                  Request one
                </Link>
              </p>
              <p className="text-center text-sm text-muted-foreground">
                New student?{' '}
                <Link to="/register" className="font-medium text-primary hover:underline">
                  Create an account
                </Link>
                . You&apos;ll be added to a class by your teacher.
              </p>
            </form>
          </CardContent>
        </Card>
      )}
    </AuthLayout>
  )
}
