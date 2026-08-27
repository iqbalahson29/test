import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { ApiError } from '../lib/api-client'
import { useAuth } from './auth-context'
import { ChooseWorkspaceStep } from './choose-workspace-step'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await login(email, password)
      // 'choosing-workspace' stays on this page — the branch below renders
      // the picker instead of navigating away.
      if (result !== 'choosing-workspace') {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
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

        {status === 'choosing-workspace' ? (
          <ChooseWorkspaceStep />
        ) : (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold">Sign in to your workspace</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
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
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Need a workspace?{' '}
                  <Link
                    to="/request-workspace"
                    className="font-medium text-primary hover:underline"
                  >
                    Request one
                  </Link>
                </p>
                <p className="text-center text-sm text-muted-foreground">
                  New student?{' '}
                  <Link to="/register" className="font-medium text-primary hover:underline">
                    Create an account
                  </Link>{' '}
                  — you&apos;ll be added to a class by your teacher.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
