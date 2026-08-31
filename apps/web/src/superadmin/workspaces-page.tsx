import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Ban, LogIn, MoreVertical, RotateCcw, Search, Trash2, Users } from 'lucide-react'
import { superAdminApi } from './api'
import type { SuperAdminTenant } from './api'
import { useAuth } from '../auth/auth-context'
import { ApiError } from '../lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DangerConfirmDialog } from '@/components/ui/danger-confirm-dialog'
import { Pagination } from '@/components/ui/pagination'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 10

interface EnterTarget {
  id: string
  name: string
}

interface StatusChangeTarget {
  tenant: SuperAdminTenant
  action: 'suspend' | 'reactivate'
}

function TenantStatusBadge({ status }: { status: SuperAdminTenant['status'] }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-transparent font-medium',
        status === 'ACTIVE'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700',
      )}
    >
      {status === 'ACTIVE' ? 'Active' : 'Suspended'}
    </Badge>
  )
}

export function WorkspacesPage() {
  const { enterWorkspace } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [enterTarget, setEnterTarget] = useState<EnterTarget | null>(null)
  const [statusChangeTarget, setStatusChangeTarget] = useState<StatusChangeTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SuperAdminTenant | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-tenants'],
    queryFn: superAdminApi.tenants,
  })

  const enterMutation = useMutation({
    mutationFn: (tenantId: string) => enterWorkspace(tenantId),
    onSuccess: () => {
      queryClient.clear()
      navigate('/admin', { replace: true })
    },
  })

  const suspendMutation = useMutation({
    mutationFn: (id: string) => superAdminApi.suspendTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] })
      setStatusChangeTarget(null)
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => superAdminApi.reactivateTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] })
      setStatusChangeTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, slug }: { id: string; slug: string }) =>
      superAdminApi.deleteTenant(id, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-tenants'] })
      setDeleteTarget(null)
    },
  })

  const actionError =
    enterMutation.error ?? suspendMutation.error ?? reactivateMutation.error ?? deleteMutation.error

  const filtered = (data ?? []).filter((t) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageTenants = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  const onSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const onConfirmStatusChange = () => {
    if (!statusChangeTarget) return
    if (statusChangeTarget.action === 'suspend') {
      suspendMutation.mutate(statusChangeTarget.tenant.id)
    } else {
      reactivateMutation.mutate(statusChangeTarget.tenant.id)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Workspaces</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Enter any workspace with full admin access, or suspend / delete it.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search workspaces…"
            className="pl-8"
          />
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {actionError instanceof ApiError ? actionError.message : 'Something went wrong'}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-none bg-card ring-1 ring-foreground/10">
          <Table containerClassName="rounded-none">
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Quizzes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No workspaces found.
                  </TableCell>
                </TableRow>
              ) : (
                pageTenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </TableCell>
                    <TableCell>
                      <TenantStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Users className="size-3.5 text-muted-foreground" />
                        {t.memberCount}
                      </span>
                    </TableCell>
                    <TableCell>{t.quizCount}</TableCell>
                    <TableCell>
                      {new Date(t.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEnterTarget({ id: t.id, name: t.name })}
                          disabled={enterMutation.isPending}
                        >
                          <LogIn />
                          Enter as admin
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm">
                              <MoreVertical />
                              <span className="sr-only">Workspace actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-52">
                            {t.status === 'ACTIVE' ? (
                              <DropdownMenuItem
                                className="gap-2 px-2 py-1.5 whitespace-nowrap"
                                onClick={() => setStatusChangeTarget({ tenant: t, action: 'suspend' })}
                              >
                                <Ban />
                                Suspend workspace
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="gap-2 px-2 py-1.5 whitespace-nowrap"
                                onClick={() => setStatusChangeTarget({ tenant: t, action: 'reactivate' })}
                              >
                                <RotateCcw />
                                Reactivate workspace
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 px-2 py-1.5 whitespace-nowrap"
                              variant="destructive"
                              onClick={() => setDeleteTarget(t)}
                            >
                              <Trash2 />
                              Delete workspace
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-[12.5px] text-muted-foreground">
                Showing {rangeStart} to {rangeEnd} of {filtered.length} workspaces
              </p>
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!enterTarget}
        onOpenChange={(open) => !open && setEnterTarget(null)}
        title="Enter workspace as admin?"
        description={
          <>
            You&apos;ll get full admin access to <strong>{enterTarget?.name}</strong> — same
            permissions as any admin of that workspace, including its member list. Use{' '}
            <strong>Back to Super Admin</strong> to return here.
          </>
        }
        confirmLabel="Enter as admin"
        loading={enterMutation.isPending}
        onConfirm={() => enterTarget && enterMutation.mutate(enterTarget.id)}
      />

      <ConfirmDialog
        open={!!statusChangeTarget}
        onOpenChange={(open) => !open && setStatusChangeTarget(null)}
        title={
          statusChangeTarget?.action === 'suspend'
            ? 'Suspend this workspace?'
            : 'Reactivate this workspace?'
        }
        description={
          statusChangeTarget?.action === 'suspend' ? (
            <>
              Every member of <strong>{statusChangeTarget.tenant.name}</strong> (
              {statusChangeTarget.tenant.memberCount} total) will be blocked from logging into it
              until it&apos;s reactivated. No data is deleted or changed — this is fully
              reversible.
            </>
          ) : (
            <>
              Members of <strong>{statusChangeTarget?.tenant.name}</strong> will immediately be
              able to log back in.
            </>
          )
        }
        confirmLabel={statusChangeTarget?.action === 'suspend' ? 'Suspend' : 'Reactivate'}
        destructive={statusChangeTarget?.action === 'suspend'}
        loading={suspendMutation.isPending || reactivateMutation.isPending}
        onConfirm={onConfirmStatusChange}
      />

      <DangerConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this workspace permanently?"
        description={
          deleteTarget && (
            <>
              This permanently deletes <strong>{deleteTarget.name}</strong> and everything in
              it — {deleteTarget.memberCount} members, {deleteTarget.quizCount} quizzes,{' '}
              {deleteTarget.attemptCount} attempts, {deleteTarget.groupCount} groups, and{' '}
              {deleteTarget.assignmentCount} assignments. This cannot be undone. If you want to
              temporarily block access instead, use <strong>Suspend workspace</strong>.
            </>
          )
        }
        confirmationValue={deleteTarget?.slug ?? ''}
        confirmationLabel={`Type "${deleteTarget?.slug ?? ''}" to confirm`}
        confirmLabel="Delete workspace"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, slug: deleteTarget.slug })
        }
      />
    </div>
  )
}
