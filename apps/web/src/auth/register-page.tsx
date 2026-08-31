import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, LineChart, Users2 } from 'lucide-react'
import { ApiError, apiPost } from '../lib/api-client'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'
import { PasswordInput, PasswordStrengthMeter } from './password-field'
import { isStrongPassword } from './password-rules'
import { consumePostAuthRedirect } from './post-auth-redirect'
import { validateConfirmPassword, validateEmail, validateRequired } from './validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const features = [
  { icon: BookOpen, text: 'Create your account now, join a workspace later' },
  { icon: Users2, text: 'Ask to join a workspace, or get added directly by your teacher' },
  { icon: LineChart, text: 'Take quizzes and track your own results over time' },
]

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = (): boolean => {
    const errors: FieldErrors = {
      name: validateRequired(name, 'Name'),
      email: validateEmail(email),
      password: isStrongPassword(password) ? undefined : 'Password does not meet the requirements below',
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    }
    setFieldErrors(errors)
    return !errors.name && !errors.email && !errors.password && !errors.confirmPassword
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate() || !agreedToTerms) {
      if (!agreedToTerms) setError('You must accept the terms to create an account')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/auth/register', { name, email, password })
      // login() now succeeds even with zero memberships (status
      // 'no-workspace'), so we can log straight in with the password
      // already sitting in this form instead of bouncing to /login.
      await login(email, password)
      navigate(consumePostAuthRedirect() ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="For students"
      title="Join your class in minutes"
      subtitle="Create a student account, then ask to join a workspace or wait for your teacher to add you."
      features={features}
    >
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Create a student account</h2>
          <p className="text-sm text-muted-foreground">
            After this, you can browse workspaces and ask to join one, or your teacher can add
            you directly by email.
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
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                aria-invalid={!!fieldErrors.name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setFieldErrors((prev) => ({ ...prev, name: validateRequired(name, 'Name') }))}
              />
              {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
            </div>
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
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
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
              <Label htmlFor="confirmPassword">Confirm password</Label>
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
            <Label htmlFor="terms" className="group flex items-start gap-2 normal-case">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm font-normal tracking-normal text-foreground">
                I agree to use this workspace responsibly and understand my activity may be visible
                to my teacher.
              </span>
            </Label>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
