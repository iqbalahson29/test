import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Filter,
  GraduationCap,
  HelpCircle,
  Mail,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { Role } from '@quiz-platform/shared'
import { ApiError } from '../../lib/api-client'
import { membershipsApi } from './api'
import type { MembershipRow } from './types'
import { memberInvitationsApi } from '../member-invitations/api'
import { workspaceDirectoryApi } from '../workspace-directory/api'
import { AddMemberDialog } from './add-member-dialog'
import { ImportMembersDialog } from './import-members-dialog'
import { MemberProfileDialog } from './member-profile-dialog'
import { StatTile } from '../analytics/stat-tile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

const PAGE_SIZE = 8
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

type RowStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'INVITED'

interface Row {
  key: string
  kind: 'membership' | 'request' | 'invitation'
  refId: string
  name: string
  email: string
  avatarUrl: string | null
  role: Role
  status: RowStatus
  joinedAt: string | null
  lastActiveAt: string | null
}

const STATUS_LABELS: Record<RowStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  PENDING: 'Pending',
  INVITED: 'Invited',
}

const STATUS_STYLES: Record<RowStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-muted text-muted-foreground',
  PENDING: 'bg-amber-50 text-amber-700',
  INVITED: 'bg-sky-50 text-sky-700',
}

function initials(name: string) {
  const chars = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
  return chars.join('') || '?'
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelative(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  const diffDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays <= 0) {
    return `Today, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return formatDate(iso)
}

export function MembersPage() {
  const queryClient = useQueryClient()
  const [rowError, setRowError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL')
  const [statusFilter, setStatusFilter] = useState<Set<RowStatus>>(
    new Set(['ACTIVE', 'INACTIVE', 'PENDING', 'INVITED']),
  )
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAllRequests, setShowAllRequests] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null)
  const [confirmAction, setConfirmActionState] = useState<
    { kind: 'role'; row: Row; nextRole: Role } | { kind: 'remove'; row: Row } | null
  >(null)
  const setConfirmAction = (
    action: { kind: 'role'; row: Row; nextRole: Role } | { kind: 'remove'; row: Row } | null,
  ) => {
    setRowError(null)
    setConfirmActionState(action)
  }

  const { data: memberships, isLoading: membershipsLoading } = useQuery({
    queryKey: ['memberships'],
    queryFn: membershipsApi.list,
  })
  const { data: pendingRequests, isLoading: pendingLoading } = useQuery({
    queryKey: ['join-requests', 'pending'],
    queryFn: workspaceDirectoryApi.pendingForMyTenant,
  })
  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ['pending-invitations'],
    queryFn: memberInvitationsApi.list,
  })
  const { data: tenant } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: workspaceDirectoryApi.myTenant,
  })
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => membershipsApi.recentActivity(),
  })
  const { data: allActivity, isLoading: allActivityLoading } = useQuery({
    queryKey: ['recent-activity', 'all'],
    queryFn: () => membershipsApi.recentActivity(50),
    enabled: showAllActivity,
  })

  const joinLink = tenant ? `${window.location.origin}/join/${tenant.slug}` : null
  const copyJoinLink = async () => {
    if (!joinLink) return
    await navigator.clipboard.writeText(joinLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['memberships'] })
    queryClient.invalidateQueries({ queryKey: ['join-requests', 'pending'] })
    queryClient.invalidateQueries({ queryKey: ['pending-invitations'] })
    queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
  }

  const onMutationError = (err: unknown, fallback: string) =>
    setRowError(err instanceof ApiError ? err.message : fallback)

  const approveMutation = useMutation({
    mutationFn: (id: string) => workspaceDirectoryApi.approve(id),
    onSuccess: () => {
      setRowError(null)
      invalidateAll()
    },
    onError: (err: unknown) => onMutationError(err, 'Could not approve this request'),
  })
  const rejectMutation = useMutation({
    mutationFn: (id: string) => workspaceDirectoryApi.reject(id),
    onSuccess: () => {
      setRowError(null)
      invalidateAll()
    },
    onError: (err: unknown) => onMutationError(err, 'Could not reject this request'),
  })
  const removeMutation = useMutation({
    mutationFn: (id: string) => membershipsApi.remove(id),
    onSuccess: () => {
      setRowError(null)
      setConfirmAction(null)
      invalidateAll()
    },
    onError: (err: unknown) => onMutationError(err, 'Could not remove this member'),
  })
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => membershipsApi.updateRole(id, role),
    onSuccess: () => {
      setRowError(null)
      setConfirmAction(null)
      invalidateAll()
    },
    onError: (err: unknown) => onMutationError(err, 'Could not update this role'),
  })
  const revokeMutation = useMutation({
    mutationFn: (id: string) => memberInvitationsApi.revoke(id),
    onSuccess: () => {
      setRowError(null)
      invalidateAll()
    },
    onError: (err: unknown) => onMutationError(err, 'Could not revoke this invite'),
  })
  const bulkRemoveMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => membershipsApi.remove(id))),
    onSuccess: () => {
      setRowError(null)
      setSelected(new Set())
      invalidateAll()
    },
    onError: (err: unknown) => onMutationError(err, 'Could not remove the selected members'),
  })

  const copyInviteLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/accept-invite/${token}`)
  }

  const rows: Row[] = useMemo(() => {
    const membershipRows: Row[] = (memberships ?? []).map((m: MembershipRow) => {
      const active =
        !!m.user.lastLoginAt &&
        Date.now() - new Date(m.user.lastLoginAt).getTime() <= ACTIVE_WINDOW_MS
      return {
        key: `m-${m.id}`,
        kind: 'membership',
        refId: m.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        status: active ? 'ACTIVE' : 'INACTIVE',
        joinedAt: m.createdAt,
        lastActiveAt: m.user.lastLoginAt,
      }
    })
    const requestRows: Row[] = (pendingRequests ?? []).map((r) => ({
      key: `r-${r.id}`,
      kind: 'request',
      refId: r.id,
      name: r.user.name,
      email: r.user.email,
      avatarUrl: null,
      role: Role.STUDENT,
      status: 'PENDING',
      joinedAt: null,
      lastActiveAt: null,
    }))
    const invitationRows: Row[] = (invitations ?? []).map((i) => ({
      key: `i-${i.id}`,
      kind: 'invitation',
      refId: i.id,
      name: i.email,
      email: i.email,
      avatarUrl: null,
      role: i.role,
      status: 'INVITED',
      joinedAt: null,
      lastActiveAt: null,
    }))
    return [...membershipRows, ...requestRows, ...invitationRows]
  }, [memberships, pendingRequests, invitations])

  const filteredRows = rows.filter((r) => {
    if (!statusFilter.has(r.status)) return false
    if (roleFilter !== 'ALL' && r.role !== roleFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  const pageMembershipIds = pageRows.filter((r) => r.kind === 'membership').map((r) => r.refId)
  const allPageSelected =
    pageMembershipIds.length > 0 && pageMembershipIds.every((id) => selected.has(id))

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageMembershipIds.forEach((id) => next.delete(id))
      } else {
        pageMembershipIds.forEach((id) => next.add(id))
      }
      return next
    })
  }
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleStatus = (status: RowStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
    setPage(1)
  }

  const onBulkRemove = () => {
    if (!window.confirm(`Remove ${selected.size} member(s)? This can't be undone.`)) return
    bulkRemoveMutation.mutate([...selected])
  }

  const totalMembers = memberships?.length ?? 0
  const studentCount = memberships?.filter((m) => m.role === Role.STUDENT).length ?? 0
  const adminCount = memberships?.filter((m) => m.role === Role.ADMIN).length ?? 0
  const pendingCount = pendingRequests?.length ?? 0
  const invitedCount = invitations?.length ?? 0
  const statsLoading = membershipsLoading || pendingLoading || invitationsLoading

  const visibleRequests = pendingRequests?.slice(0, 3) ?? []
  const visibleActivity = activity ?? []

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Manage members</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Invite, manage, and control access to your workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <ImportMembersDialog />
          <AddMemberDialog />
        </div>
      </div>

      {rowError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <Card className="rounded-md">
            <button
              type="button"
              onClick={() => setStatsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 text-left"
            >
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-[12.5px] font-bold text-gray-800">Overview</span>
                {!statsOpen && !statsLoading && (
                  <span className="truncate text-xs text-muted-foreground">
                    {totalMembers} members · {studentCount} students · {adminCount} admins ·{' '}
                    {pendingCount} pending · {invitedCount} invited
                  </span>
                )}
              </div>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${statsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {statsOpen && (
              <CardContent>
                {statsLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <StatTile
                      label="Total members"
                      value={String(totalMembers)}
                      icon={Users}
                      footer="Across all roles"
                    />
                    <StatTile
                      label="Students"
                      value={String(studentCount)}
                      icon={GraduationCap}
                      footer={
                        totalMembers > 0
                          ? `${Math.round((studentCount / totalMembers) * 100)}% of members`
                          : undefined
                      }
                    />
                    <StatTile
                      label="Admins"
                      value={String(adminCount)}
                      icon={ShieldCheck}
                      footer={
                        totalMembers > 0
                          ? `${Math.round((adminCount / totalMembers) * 100)}% of members`
                          : undefined
                      }
                    />
                    <StatTile
                      label="Pending requests"
                      value={String(pendingCount)}
                      icon={UserCog}
                      footer="Awaiting approval"
                    />
                    <StatTile
                      label="Invited"
                      value={String(invitedCount)}
                      icon={Mail}
                      footer="Invitations sent"
                    />
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-md">
              <CardHeader>
                <h2 className="text-[12.5px] font-bold text-gray-800">Invite students</h2>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Share this link with students. They&apos;ll be able to request to join, and
                  you can approve or reject each request below.
                </p>
                {joinLink ? (
                  <div className="flex gap-2">
                    <Input readOnly value={joinLink} onFocus={(e) => e.target.select()} />
                    <Button type="button" variant="outline" onClick={copyJoinLink}>
                      {copied ? <Check className="text-emerald-600" /> : <Copy />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                ) : (
                  <Skeleton className="h-9 w-full" />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-[12.5px] font-bold text-gray-800">Join requests</h2>
                {(pendingRequests?.length ?? 0) > 3 && (
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
                {pendingLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : visibleRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending requests.</p>
                ) : (
                  visibleRequests.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.user.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {r.user.email}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => approveMutation.mutate(r.id)}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                        >
                          <Check className="text-emerald-600" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => rejectMutation.mutate(r.id)}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                        >
                          <X className="text-destructive" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-md">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12.5px] font-bold text-gray-800">
                All members ({rows.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search members…"
                    className="w-48 pl-8"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <Filter />
                      Filter
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48" align="end">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Status</p>
                    <div className="space-y-1.5">
                      {(Object.keys(STATUS_LABELS) as RowStatus[]).map((status) => (
                        <label key={status} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={statusFilter.has(status)}
                            onCheckedChange={() => toggleStatus(status)}
                          />
                          {STATUS_LABELS[status]}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Select
                  value={roleFilter}
                  onValueChange={(v) => {
                    setRoleFilter(v as 'ALL' | Role)
                    setPage(1)
                  }}
                >
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All roles</SelectItem>
                    <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                    <SelectItem value={Role.STUDENT}>Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {selected.size > 0 && (
                <div className="mb-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                  <span>{selected.size} selected</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={onBulkRemove}
                      disabled={bulkRemoveMutation.isPending}
                    >
                      <Trash2 />
                      Remove {selected.size} member{selected.size === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
              )}

              {membershipsLoading || pendingLoading || invitationsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No members yet.</p>
              ) : filteredRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No members match your search or filters.
                </p>
              ) : (
                <>
                  <Table containerClassName="rounded-md">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <Checkbox checked={allPageSelected} onCheckedChange={toggleAllOnPage} />
                        </TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Last active</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((r) => (
                        <TableRow
                          key={r.key}
                          className={r.kind === 'membership' ? 'cursor-pointer' : undefined}
                          onClick={() => r.kind === 'membership' && setViewingMemberId(r.refId)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={r.kind === 'membership' && selected.has(r.refId)}
                              disabled={r.kind !== 'membership'}
                              onCheckedChange={() =>
                                r.kind === 'membership' && toggleRow(r.refId)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar size="sm" className="rounded-md">
                                <AvatarImage src={r.avatarUrl ?? undefined} alt="" className="rounded-md" />
                                <AvatarFallback className="rounded-md">{initials(r.name)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-gray-800">{r.name}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {r.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.role}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(r.joinedAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatRelative(r.lastActiveAt)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[r.status]}`}
                            >
                              {STATUS_LABELS[r.status]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" aria-label="Row actions">
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {r.kind === 'membership' && (
                                  <>
                                    <DropdownMenuItem
                                      className="gap-2 px-2.5 py-2"
                                      onClick={() =>
                                        setConfirmAction({
                                          kind: 'role',
                                          row: r,
                                          nextRole: r.role === Role.ADMIN ? Role.STUDENT : Role.ADMIN,
                                        })
                                      }
                                    >
                                      <UserCog />
                                      {r.role === Role.ADMIN ? 'Make student' : 'Make admin'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      className="gap-2 px-2.5 py-2"
                                      onClick={() => setConfirmAction({ kind: 'remove', row: r })}
                                    >
                                      <Trash2 />
                                      Remove member
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {r.kind === 'request' && (
                                  <>
                                    <DropdownMenuItem
                                      className="gap-2 px-2.5 py-2"
                                      onClick={() => approveMutation.mutate(r.refId)}
                                    >
                                      <Check />
                                      Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      className="gap-2 px-2.5 py-2"
                                      onClick={() => rejectMutation.mutate(r.refId)}
                                    >
                                      <X />
                                      Reject
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {r.kind === 'invitation' && (
                                  <>
                                    <DropdownMenuItem
                                      className="gap-2 px-2.5 py-2"
                                      onClick={() => {
                                        const invite = invitations?.find((i) => i.id === r.refId)
                                        if (invite) void copyInviteLink(invite.token)
                                      }}
                                    >
                                      <Copy />
                                      Copy invite link
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      className="gap-2 px-2.5 py-2"
                                      onClick={() => revokeMutation.mutate(r.refId)}
                                    >
                                      <X />
                                      Revoke invite
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[12.5px] text-muted-foreground">
                      Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                      {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of{' '}
                      {filteredRows.length} members
                    </p>
                    <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="w-full space-y-4 xl:w-80 xl:shrink-0">
          <Card className="rounded-md">
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-[12.5px] font-bold text-gray-800">Recent activity</h2>
              {visibleActivity.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllActivity(true)}
                >
                  View all
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : visibleActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {visibleActivity.map((a) => (
                    <li key={a.id} className="text-sm">
                      <p className="text-gray-800">{a.message}</p>
                      <p className="text-xs text-muted-foreground">{formatRelative(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <h2 className="text-[12.5px] font-bold text-gray-800">Role permissions</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">Admin</p>
                  <p className="text-xs text-muted-foreground">Full access to manage workspace</p>
                </div>
                <Badge variant="secondary">{adminCount}</Badge>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GraduationCap className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">Student</p>
                  <p className="text-xs text-muted-foreground">Can take quizzes and view results</p>
                </div>
                <Badge variant="secondary">{studentCount}</Badge>
              </div>
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
                  Visit our help center for guides and FAQs.
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
            <DialogTitle>Join requests ({pendingRequests?.length ?? 0})</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {pendingRequests?.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.user.email}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => approveMutation.mutate(r.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <Check className="text-emerald-600" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => rejectMutation.mutate(r.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <X className="text-destructive" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAllActivity} onOpenChange={setShowAllActivity}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recent activity</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {allActivityLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              (allActivity ?? []).map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-gray-800">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(a.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          {confirmAction && (
            <>
              <DialogHeader>
                <div
                  className={`flex size-9 items-center justify-center rounded-full ${
                    confirmAction.kind === 'remove'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {confirmAction.kind === 'remove' ? (
                    <AlertTriangle className="size-4" />
                  ) : (
                    <UserCog className="size-4" />
                  )}
                </div>
                {confirmAction.kind === 'role' ? (
                  <>
                    <DialogTitle>
                      {confirmAction.nextRole === Role.ADMIN ? 'Make admin?' : 'Make student?'}
                    </DialogTitle>
                    <DialogDescription>
                      {confirmAction.nextRole === Role.ADMIN
                        ? `${confirmAction.row.name} will get full access to manage this workspace, including members and quizzes.`
                        : `${confirmAction.row.name} will lose admin access and become a student in this workspace.`}
                    </DialogDescription>
                  </>
                ) : (
                  <>
                    <DialogTitle>Remove {confirmAction.row.name}?</DialogTitle>
                    <DialogDescription>
                      They'll lose access to this workspace and its quizzes. This can't be undone.
                    </DialogDescription>
                  </>
                )}
              </DialogHeader>
              {rowError && (
                <Alert variant="destructive">
                  <AlertDescription>{rowError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={confirmAction.kind === 'remove' ? 'destructive' : 'default'}
                  disabled={roleMutation.isPending || removeMutation.isPending}
                  onClick={() =>
                    confirmAction.kind === 'role'
                      ? roleMutation.mutate({ id: confirmAction.row.refId, role: confirmAction.nextRole })
                      : removeMutation.mutate(confirmAction.row.refId)
                  }
                >
                  {confirmAction.kind === 'remove'
                    ? removeMutation.isPending
                      ? 'Removing…'
                      : 'Remove member'
                    : roleMutation.isPending
                      ? 'Saving…'
                      : 'Confirm'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <MemberProfileDialog
        membershipId={viewingMemberId}
        onOpenChange={(open) => !open && setViewingMemberId(null)}
      />
    </div>
  )
}
