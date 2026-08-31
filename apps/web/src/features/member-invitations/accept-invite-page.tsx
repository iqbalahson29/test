import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { useAuth } from '../../auth/auth-context'
import { memberInvitationsApi } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

export function AcceptInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => memberInvitationsApi.byToken(token),
    retry: false,
  })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!invite) return
    setError(null)
    setSubmitting(true)
    try {
      await memberInvitationsApi.accept(token, name, password)
      await login(invite.email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept this invite')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/brand.png" alt="Test Platform" className="size-10 object-contain" />
          <h1 className="text-lg font-semibold">Test Platform</h1>
        </div>

        <Card>
          {isLoading ? (
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          ) : isError || !invite ? (
            <CardContent className="pt-6">
              <Alert variant="destructive">
                <AlertDescription>
                  This invite is invalid or no longer available.
                </AlertDescription>
              </Alert>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Building2 className="size-4 text-muted-foreground" />
                  {invite.tenantName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve been invited to join as{' '}
                  <Badge variant="outline">{invite.role}</Badge>
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
                    <Label htmlFor="invite-email">Email</Label>
                    <Input id="invite-email" value={invite.email} disabled readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-name">Your name</Label>
                    <Input
                      id="invite-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-password">Password</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      required
                      minLength={10}
                      maxLength={72}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      At least 10 characters, with an uppercase letter, a lowercase letter, and a
                      number.
                    </p>
                  </div>
                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? 'Setting up your account…' : 'Accept invite'}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
