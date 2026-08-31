import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react'
import { ApiError, apiPost } from '../lib/api-client'
import { AuthLayout } from './auth-layout'
import { PasswordInput, PasswordStrengthMeter } from './password-field'
import { isStrongPassword } from './password-rules'
import { validateConfirmPassword, validateEmail, validateRequired } from './validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

const features = [
  { icon: Building2, text: 'A dedicated workspace for your school, class, or organization' },
  { icon: UserPlus, text: 'Invite teachers and students once your workspace is approved' },
  { icon: ShieldCheck, text: 'Every request is reviewed by a platform admin before it goes live' },
]

interface RequestForm {
  workspaceName: string
  description: string
  requesterName: string
  requesterEmail: string
  password: string
}

const emptyForm: RequestForm = {
  workspaceName: '',
  description: '',
  requesterName: '',
  requesterEmail: '',
  password: '',
}

interface FieldErrors {
  workspaceName?: string
  requesterName?: string
  requesterEmail?: string
  password?: string
  confirmPassword?: string
}

export function RequestWorkspacePage() {
  const [form, setForm] = useState<RequestForm>(emptyForm)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const validate = (): boolean => {
    const errors: FieldErrors = {
      workspaceName: validateRequired(form.workspaceName, 'Workspace name'),
      requesterName: validateRequired(form.requesterName, 'Your name'),
      requesterEmail: validateEmail(form.requesterEmail),
      password: isStrongPassword(form.password)
        ? undefined
        : 'Password does not meet the requirements below',
      confirmPassword: validateConfirmPassword(form.password, confirmPassword),
    }
    setFieldErrors(errors)
    return Object.values(errors).every((e) => !e)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate() || !agreedToTerms) {
      if (!agreedToTerms) setError('You must accept the terms to request a workspace')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/tenant-requests', {
        ...form,
        description: form.description.trim() || undefined,
      })
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
    <AuthLayout
      eyebrow="For administrators"
      title="Start your own quiz workspace"
      subtitle="Request a workspace for your organization, then invite teachers and students once it's approved."
      features={features}
    >
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Request a workspace</h2>
          <p className="text-sm text-muted-foreground">
            Tell us about your organization. We&apos;ll review your request and email you once
            it&apos;s approved.
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
              <Label htmlFor="workspaceName">Workspace name</Label>
              <Input
                id="workspaceName"
                value={form.workspaceName}
                aria-invalid={!!fieldErrors.workspaceName}
                onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    workspaceName: validateRequired(form.workspaceName, 'Workspace name'),
                  }))
                }
              />
              {fieldErrors.workspaceName && (
                <p className="text-xs text-destructive">{fieldErrors.workspaceName}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={2}
                maxLength={280}
                placeholder="What is this workspace for?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <p className="text-right text-xs text-muted-foreground">
                {form.description.length}/280
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requesterName">Your name</Label>
              <Input
                id="requesterName"
                value={form.requesterName}
                aria-invalid={!!fieldErrors.requesterName}
                onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    requesterName: validateRequired(form.requesterName, 'Your name'),
                  }))
                }
              />
              {fieldErrors.requesterName && (
                <p className="text-xs text-destructive">{fieldErrors.requesterName}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requesterEmail">Email</Label>
              <Input
                id="requesterEmail"
                type="email"
                value={form.requesterEmail}
                aria-invalid={!!fieldErrors.requesterEmail}
                onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    requesterEmail: validateEmail(form.requesterEmail),
                  }))
                }
              />
              {fieldErrors.requesterEmail && (
                <p className="text-xs text-destructive">{fieldErrors.requesterEmail}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={form.password}
                invalid={!!fieldErrors.password}
                onChange={(value) => setForm({ ...form, password: value })}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    password: isStrongPassword(form.password)
                      ? undefined
                      : 'Password does not meet the requirements below',
                  }))
                }
              />
              <PasswordStrengthMeter password={form.password} />
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
                    confirmPassword: validateConfirmPassword(form.password, confirmPassword),
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
                I confirm I&apos;m authorized to create a workspace for this organization and
                accept responsibility for its use.
              </span>
            </Label>
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
    </AuthLayout>
  )
}
