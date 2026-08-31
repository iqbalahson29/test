import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  HelpCircle,
  KeyRound,
  Link2,
  Mail,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { authApi } from '../../auth/api'
import { useAuth } from '../../auth/auth-context'
import { workspaceDirectoryApi } from './api'
import type { JoinRequestStatus } from './types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PAGE_SIZE = 5

type StatusFilter = 'ALL' | 'AVAILABLE' | 'MEMBER' | 'PENDING'

interface InfoItem {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
}

const WHY_JOIN: InfoItem[] = [
  { icon: ClipboardList, title: 'Access quizzes', body: 'Take quizzes and view results.' },
  { icon: BarChart3, title: 'Track progress', body: 'Monitor your performance and analytics.' },
  { icon: Users, title: 'Work together', body: 'Collaborate with your team and teachers.' },
]

const TIPS: InfoItem[] = [
  {
    icon: Link2,
    title: 'Use an invite link',
    body: 'Paste the link you received from your teacher or admin.',
  },
  {
    icon: ShieldCheck,
    title: 'Need access?',
    body: "If you can't find your workspace, ask your admin to send an invite.",
  },
  { icon: Mail, title: 'Check your email', body: 'Invitations are usually sent via email.' },
]

const REQUEST_STATUS_STYLES: Record<JoinRequestStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 [&>svg]:text-amber-500',
  APPROVED: 'bg-emerald-50 text-emerald-700 [&>svg]:text-emerald-500',
  REJECTED: 'bg-muted text-muted-foreground [&>svg]:text-muted-foreground/70',
}

function RequestStatusBadge({ status }: { status: JoinRequestStatus }) {
  return (
    <Badge
      variant="secondary"
      className={`gap-1.5 border-transparent font-medium ${REQUEST_STATUS_STYLES[status]}`}
    >
      <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0">
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
      {status}
    </Badge>
  )
}

function extractSlug(input: string): string | null {
  const withoutQuery = input.trim().split(/[?#]/)[0]
  const parts = withoutQuery.split('/').filter(Boolean)
  return parts[parts.length - 1] || null
}

type ConfirmAction =
  | { kind: 'request'; tenantId: string; tenantName: string }
  | { kind: 'view'; tenantId: string; tenantName: string }
  | { kind: 'cancel'; requestId: string; tenantName: string }

export function WorkspaceDirectory() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { status: authStatus, membership, switchWorkspace, refreshSession } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [showAllRequests, setShowAllRequests] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinCodeSuccess, setJoinCodeSuccess] = useState<{
    membershipId: string
    tenantName: string
  } | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const { data: entries, isLoading } = useQuery({
    queryKey: ['workspace-directory'],
    queryFn: workspaceDirectoryApi.list,
  })
  const { data: myRequests } = useQuery({
    queryKey: ['my-join-requests'],
    queryFn: workspaceDirectoryApi.mine,
  })
  const { data: myMemberships } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: authApi.myMemberships,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspace-directory'] })
    queryClient.invalidateQueries({ queryKey: ['my-join-requests'] })
  }

  const requestMutation = useMutation({
    mutationFn: (tenantId: string) => workspaceDirectoryApi.request(tenantId),
    onSuccess: () => {
      invalidate()
      setError(null)
      setConfirmAction(null)
    },
    onError: (err: unknown) => {
      setConfirmAction(null)
      setError(err instanceof ApiError ? err.message : 'Could not send request')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => workspaceDirectoryApi.cancel(id),
    onSuccess: () => {
      invalidate()
      setError(null)
      setConfirmAction(null)
    },
    onError: (err: unknown) => {
      setConfirmAction(null)
      setError(err instanceof ApiError ? err.message : 'Could not cancel request')
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (link: string) => {
      const slug = extractSlug(link)
      if (!slug) throw new ApiError(400, 'Paste a valid invite link')
      const tenant = await workspaceDirectoryApi.bySlug(slug)
      return workspaceDirectoryApi.request(tenant.id)
    },
    onSuccess: () => {
      invalidate()
      setError(null)
      setInviteSuccess(true)
      setInviteLink('')
    },
    onError: (err: unknown) => {
      setInviteSuccess(false)
      setError(err instanceof ApiError ? err.message : 'Could not resolve that invite link')
    },
  })

  const joinByCodeMutation = useMutation({
    mutationFn: (code: string) => workspaceDirectoryApi.joinByCode(code),
    onSuccess: (result) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['my-memberships'] })
      setError(null)
      setJoinCodeSuccess({ membershipId: result.membershipId, tenantName: result.tenantName })
      setJoinCode('')
    },
    onError: (err: unknown) => {
      setJoinCodeSuccess(null)
      setError(err instanceof ApiError ? err.message : 'Could not join with that code')
    },
  })

  const filteredEntries = useMemo(() => {
    if (!entries) return []
    return entries.filter((entry) => {
      if (statusFilter === 'MEMBER' && entry.membershipStatus !== 'MEMBER') return false
      if (statusFilter === 'PENDING' && entry.membershipStatus !== 'PENDING') return false
      if (statusFilter === 'AVAILABLE' && entry.membershipStatus !== null) return false
      if (search && !entry.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [entries, statusFilter, search])

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageEntries = filteredEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  const onView = async (tenantId: string) => {
    if (membership?.tenantId === tenantId) {
      navigate('/student')
      return
    }
    const target = myMemberships?.find((m) => m.tenantId === tenantId)
    if (!target) return
    setSwitchingId(tenantId)
    try {
      await switchWorkspace(target.membershipId)
      navigate('/student')
    } finally {
      setSwitchingId(null)
    }
  }

  const onGoToJoinedWorkspace = async () => {
    if (!joinCodeSuccess) return
    if (authStatus === 'no-workspace') {
      // No 'access' token yet to call switch-workspace with — re-derive the
      // session from the refresh cookie instead, same as "Check again"
      // above does once a 0-membership account picks up its first one.
      await refreshSession()
      navigate('/')
    } else {
      await switchWorkspace(joinCodeSuccess.membershipId)
      navigate('/student')
    }
  }

  const visibleRequests = myRequests?.slice(0, 3) ?? []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[17px] font-bold text-gray-900">Join a workspace</h1>
        <p className="mt-1 text-[12px] text-gray-400">
          Join an existing workspace to access quizzes, participate, and collaborate.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <Card className="rounded-md">
            <button
              type="button"
              onClick={() => setInviteOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <span className="text-[12.5px] font-bold text-gray-800">
                    Have an invite link?
                  </span>
                  {!inviteOpen && (
                    <p className="truncate text-xs text-muted-foreground">
                      Paste the invitation link you received to request access.
                    </p>
                  )}
                </div>
              </div>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${inviteOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {inviteOpen && (
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  Paste the invitation link you received to request access.
                </p>
                {inviteSuccess ? (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertDescription>
                    Request sent — a workspace admin needs to approve it before you can access
                    it.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={inviteLink}
                      onChange={(e) => setInviteLink(e.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={!inviteLink.trim() || inviteMutation.isPending}
                      onClick={() => inviteMutation.mutate(inviteLink)}
                    >
                      {inviteMutation.isPending ? 'Joining…' : 'Join workspace'}
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    The link is safe and secure. It will only work for the intended workspace.
                  </p>
                </>
              )}
              </CardContent>
            )}
          </Card>

          <Card className="rounded-md">
            <button
              type="button"
              onClick={() => setCodeOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <span className="text-[12.5px] font-bold text-gray-800">
                    Have a workspace code?
                  </span>
                  {!codeOpen && (
                    <p className="truncate text-xs text-muted-foreground">
                      Enter the code your teacher or admin shared to join instantly.
                    </p>
                  )}
                </div>
              </div>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${codeOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {codeOpen && (
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  Enter the code your teacher or admin shared to join instantly.
                </p>
                {joinCodeSuccess ? (
                  <Alert>
                    <CheckCircle2 className="size-4" />
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>You&apos;ve joined {joinCodeSuccess.tenantName}.</span>
                      <Button type="button" size="sm" onClick={onGoToJoinedWorkspace}>
                        Go to workspace
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
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
                        disabled={!joinCode.trim() || joinByCodeMutation.isPending}
                        onClick={() => joinByCodeMutation.mutate(joinCode)}
                      >
                        {joinByCodeMutation.isPending ? 'Joining…' : 'Join'}
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Codes join you right away — no approval needed.
                    </p>
                  </>
                )}
              </CardContent>
            )}
          </Card>

          <Card className="rounded-md">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[12.5px] font-bold text-gray-800">Available workspaces</h2>
                <p className="text-xs text-muted-foreground">
                  Browse public or request access to join a workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search workspaces…"
                    className="w-48 pl-8"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v as StatusFilter)
                    setPage(1)
                  }}
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All workspaces</SelectItem>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : filteredEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {entries?.length === 0
                    ? 'No workspaces exist yet.'
                    : 'No workspaces match your search or filters.'}
                </p>
              ) : (
                <>
                  <Table containerClassName="rounded-md">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workspace</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageEntries.map((entry) => (
                        <TableRow key={entry.tenantId}>
                          <TableCell className="whitespace-normal">
                            <Link
                              to={`/join/${entry.slug}`}
                              className="flex items-center gap-2.5 hover:opacity-80"
                            >
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Building2 className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-gray-800 hover:text-primary hover:underline">
                                  {entry.name}
                                </div>
                                {entry.membershipStatus === 'MEMBER' && (
                                  <Badge variant="secondary" className="mt-0.5 gap-1 text-[10px]">
                                    <Check className="size-2.5" />
                                    Member
                                  </Badge>
                                )}
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">
                            {entry.description || '—'}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Users className="size-3.5" />
                              {entry.memberCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.membershipStatus === 'MEMBER' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={switchingId === entry.tenantId}
                                onClick={() =>
                                  setConfirmAction({
                                    kind: 'view',
                                    tenantId: entry.tenantId,
                                    tenantName: entry.name,
                                  })
                                }
                              >
                                {switchingId === entry.tenantId ? 'Opening…' : 'View'}
                              </Button>
                            ) : entry.membershipStatus === 'PENDING' ? (
                              <Badge
                                variant="secondary"
                                className="gap-1 bg-amber-50 text-amber-700 [&>svg]:text-amber-500"
                              >
                                <Clock className="size-3" />
                                Pending
                              </Badge>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={requestMutation.isPending}
                                onClick={() =>
                                  setConfirmAction({
                                    kind: 'request',
                                    tenantId: entry.tenantId,
                                    tenantName: entry.name,
                                  })
                                }
                              >
                                Request to join
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[12.5px] text-muted-foreground">
                      Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                      {Math.min(currentPage * PAGE_SIZE, filteredEntries.length)} of{' '}
                      {filteredEntries.length} workspaces
                    </p>
                    <Pagination
                      page={currentPage}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader className="flex items-center justify-between">
              <div>
                <h2 className="text-[12.5px] font-bold text-gray-800">Join requests</h2>
                <p className="text-xs text-muted-foreground">
                  Track your pending workspace join requests.
                </p>
              </div>
              {(myRequests?.length ?? 0) > 3 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllRequests(true)}
                >
                  View all
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {!myRequests ? (
                <Skeleton className="h-10 w-full" />
              ) : visibleRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t requested to join any workspace yet.
                </p>
              ) : (
                visibleRequests.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{r.tenantName}</span>
                    <div className="flex items-center gap-2">
                      <RequestStatusBadge status={r.status} />
                      {r.status === 'PENDING' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={cancelMutation.isPending}
                          onClick={() =>
                            setConfirmAction({
                              kind: 'cancel',
                              requestId: r.id,
                              tenantName: r.tenantName,
                            })
                          }
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="w-full space-y-4 xl:w-80 xl:shrink-0">
          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-[12.5px] font-bold text-gray-800">Why join a workspace?</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {WHY_JOIN.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-[12.5px] font-bold text-gray-800">Tips</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {TIPS.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardContent className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HelpCircle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">Need help?</p>
                <p className="mb-2 text-xs text-muted-foreground">
                  Visit our help center for guides and FAQs on joining workspaces.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/help">Visit help center</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={showAllRequests} onOpenChange={setShowAllRequests}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join requests ({myRequests?.length ?? 0})</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {myRequests?.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="font-medium">{r.tenantName}</span>
                <div className="flex items-center gap-2">
                  <RequestStatusBadge status={r.status} />
                  {r.status === 'PENDING' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={cancelMutation.isPending}
                      onClick={() =>
                        setConfirmAction({
                          kind: 'cancel',
                          requestId: r.id,
                          tenantName: r.tenantName,
                        })
                      }
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          {confirmAction && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmAction.kind === 'request' &&
                    `Request to join ${confirmAction.tenantName}?`}
                  {confirmAction.kind === 'view' && `Switch to ${confirmAction.tenantName}?`}
                  {confirmAction.kind === 'cancel' &&
                    `Cancel your request to ${confirmAction.tenantName}?`}
                </DialogTitle>
                <DialogDescription>
                  {confirmAction.kind === 'request' &&
                    'A workspace admin will need to approve your request before you can access it.'}
                  {confirmAction.kind === 'view' &&
                    "You'll be switched into this workspace and taken to its dashboard."}
                  {confirmAction.kind === 'cancel' &&
                    'This withdraws your pending request. You can request to join again later.'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant={confirmAction.kind === 'cancel' ? 'destructive' : 'default'}
                  disabled={
                    (confirmAction.kind === 'request' && requestMutation.isPending) ||
                    (confirmAction.kind === 'cancel' && cancelMutation.isPending) ||
                    (confirmAction.kind === 'view' && switchingId === confirmAction.tenantId)
                  }
                  onClick={() => {
                    if (confirmAction.kind === 'request') {
                      requestMutation.mutate(confirmAction.tenantId)
                    } else if (confirmAction.kind === 'cancel') {
                      cancelMutation.mutate(confirmAction.requestId)
                    } else {
                      const tenantId = confirmAction.tenantId
                      setConfirmAction(null)
                      void onView(tenantId)
                    }
                  }}
                >
                  {confirmAction.kind === 'request'
                    ? requestMutation.isPending
                      ? 'Requesting…'
                      : 'Request to join'
                    : confirmAction.kind === 'cancel'
                      ? cancelMutation.isPending
                        ? 'Cancelling…'
                        : 'Cancel request'
                      : 'Switch workspace'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
