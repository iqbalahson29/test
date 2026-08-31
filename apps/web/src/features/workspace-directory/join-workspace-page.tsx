import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, Check, CheckCircle2, KeyRound, Users } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { useAuth } from '../../auth/auth-context'
import { AppShell } from '../../auth/app-shell'
import { setPostAuthRedirect } from '../../auth/post-auth-redirect'
import { workspaceDirectoryApi } from './api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export function JoinWorkspacePage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status, refreshSession, switchWorkspace } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinCodeSuccess, setJoinCodeSuccess] = useState<{ membershipId: string } | null>(null)

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ['join-workspace-tenant', slug],
    queryFn: () => workspaceDirectoryApi.bySlug(slug),
    retry: false,
  })

  const requestMutation = useMutation({
    mutationFn: (tenantId: string) => workspaceDirectoryApi.request(tenantId),
    onSuccess: () => setError(null),
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not send request'),
  })

  const joinByCodeMutation = useMutation({
    mutationFn: (code: string) => workspaceDirectoryApi.joinByCode(code),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['my-memberships'] })
      setError(null)
      setJoinCodeSuccess({ membershipId: result.membershipId })
      setJoinCode('')
    },
    onError: (err: unknown) => {
      setJoinCodeSuccess(null)
      setError(err instanceof ApiError ? err.message : 'Could not join with that code')
    },
  })

  const onGoToJoinedWorkspace = async () => {
    if (!joinCodeSuccess) return
    if (status === 'no-workspace') {
      await refreshSession()
      navigate('/')
    } else {
      await switchWorkspace(joinCodeSuccess.membershipId)
      navigate('/student')
    }
  }

  const goToAuth = (path: '/login' | '/register') => {
    setPostAuthRedirect(`/join/${slug}`)
    navigate(path)
  }

  // A signed-in identity — any of these can send the join request straight
  // away. 'unauthenticated' and 'choosing-workspace' can't (no access token
  // exists yet), so they're routed to sign in first.
  const canRequest =
    status === 'authenticated' || status === 'no-workspace' || status === 'superadmin'

  const card = (
    <Card className="overflow-hidden">
      {isLoading ? (
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      ) : isError || !tenant ? (
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertDescription>
              This invite link is invalid, or the workspace no longer exists.
            </AlertDescription>
          </Alert>
        </CardContent>
      ) : (
        <>
          {tenant.bannerImageUrl && (
            <img
              src={tenant.bannerImageUrl}
              alt=""
              className="h-36 w-full object-cover sm:h-44"
            />
          )}
          <CardHeader>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="size-4 text-muted-foreground" />
              {tenant.name}
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {tenant.memberCount} member{tenant.memberCount === 1 ? '' : 's'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tenant.description || "You've been invited to join this workspace."}
            </p>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {requestMutation.isSuccess ? (
              <Alert>
                <Check className="size-4" />
                <AlertDescription>
                  Request sent — a workspace admin needs to approve it before you can sign
                  in.{' '}
                  <Link to="/login" className="font-medium text-primary hover:underline">
                    Back to sign in
                  </Link>
                </AlertDescription>
              </Alert>
            ) : status === 'loading' ? (
              <Skeleton className="h-9 w-full" />
            ) : canRequest ? (
              <Button
                type="button"
                className="w-1/4"
                disabled={requestMutation.isPending}
                onClick={() => requestMutation.mutate(tenant.id)}
              >
                {requestMutation.isPending ? 'Sending request…' : 'Request to join'}
              </Button>
            ) : (
              <div className="space-y-2">
                <Button type="button" className="w-full" onClick={() => goToAuth('/register')}>
                  Create an account
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => goToAuth('/login')}
                >
                  I already have an account
                </Button>
              </div>
            )}

            {canRequest && !requestMutation.isSuccess && (
              <div className="space-y-2 border-t pt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  Have a workspace code?
                </p>
                {joinCodeSuccess ? (
                  <Alert>
                    <CheckCircle2 className="size-4" />
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>You&apos;ve joined {tenant.name}.</span>
                      <Button type="button" size="sm" onClick={onGoToJoinedWorkspace}>
                        Go to workspace
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. ACME2026"
                      maxLength={12}
                      className="uppercase"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!joinCode.trim() || joinByCodeMutation.isPending}
                      onClick={() => joinByCodeMutation.mutate(joinCode)}
                    >
                      {joinByCodeMutation.isPending ? 'Joining…' : 'Join'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  )

  // Reached two ways: an anonymous visitor following a shared invite link
  // (no session, no app chrome to show), or a signed-in identity browsing in
  // from the workspace directory — authenticated or a 0-membership
  // 'no-workspace' account — who should keep their navbar/sidebar rather
  // than dropping into a bare full-screen card.
  if (status === 'authenticated' || status === 'no-workspace') {
    return (
      <AppShell>
        <div className="w-full">
          <Link
            to={status === 'authenticated' ? '/student/join-workspace' : '/no-workspace'}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="size-3.5" />
            Back to workspaces
          </Link>
          {card}
        </div>
      </AppShell>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/brand.png" alt="Test Platform" className="size-10 object-contain" />
          <h1 className="text-lg font-semibold">Test Platform</h1>
        </div>
        {card}
      </div>
    </div>
  )
}
