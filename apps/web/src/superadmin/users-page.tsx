import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  MoreVertical,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { superAdminApi } from './api'
import type { SuperAdminUser } from './api'
import { ApiError } from '../lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DangerConfirmDialog } from '@/components/ui/danger-confirm-dialog'
import { Pagination } from '@/components/ui/pagination'
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

interface StatusChangeTarget {
  user: SuperAdminUser
  action: 'suspend' | 'reactivate'
}

function UserStatusBadge({ user }: { user: SuperAdminUser }) {
  if (user.isSuperAdmin) {
    return (
      <Badge variant="secondary" className="gap-1 border-transparent bg-primary-50 font-medium text-primary-700">
        <ShieldCheck className="size-3" />
        Super Admin
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-transparent font-medium',
        user.isSuspended ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
      )}
    >
      {user.isSuspended ? 'Suspended' : 'Active'}
    </Badge>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function EditUserDialog({
  user,
  onOpenChange,
}: {
  user: SuperAdminUser | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (user) {
      setName(user.name)
      setEmail(user.email)
      setNewPassword('')
    }
  }, [user])

  const mutation = useMutation({
    mutationFn: () =>
      superAdminApi.updateUser(user!.id, {
        name,
        email,
        newPassword: newPassword || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-users'] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Update this user's name, email, or password.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          {mutation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="edit-user-name">Name</Label>
            <Input id="edit-user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-user-email">Email</Label>
            <Input
              id="edit-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-user-password">New password</Label>
            <Input
              id="edit-user-password"
              type="password"
              minLength={10}
              maxLength={72}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
            />
            <p className="text-xs text-muted-foreground">
              At least 10 characters, with an uppercase letter, a lowercase letter, and a number.
              Resetting it signs this user out everywhere.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editTarget, setEditTarget] = useState<SuperAdminUser | null>(null)
  const [statusChangeTarget, setStatusChangeTarget] = useState<StatusChangeTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SuperAdminUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-users'],
    queryFn: superAdminApi.users,
  })

  const suspendMutation = useMutation({
    mutationFn: (id: string) => superAdminApi.suspendUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-users'] })
      setStatusChangeTarget(null)
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => superAdminApi.reactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-users'] })
      setStatusChangeTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      superAdminApi.deleteUser(id, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-users'] })
      setDeleteTarget(null)
    },
  })

  const actionError = suspendMutation.error ?? reactivateMutation.error ?? deleteMutation.error

  const filtered = (data ?? []).filter((u) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageUsers = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  const onSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const onConfirmStatusChange = () => {
    if (!statusChangeTarget) return
    if (statusChangeTarget.action === 'suspend') {
      suspendMutation.mutate(statusChangeTarget.user.id)
    } else {
      reactivateMutation.mutate(statusChangeTarget.user.id)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-[12px] text-gray-400">
            Every account on the platform — edit, suspend, or delete.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search users…"
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
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                pageUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <UserStatusBadge user={u} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {u.memberships.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {u.memberships.map((m) => (
                            <Badge key={m.tenantId} variant="secondary" className="font-normal">
                              {m.tenantName} · {m.role}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(u.lastLoginAt)}</TableCell>
                    <TableCell>{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditTarget(u)}
                        >
                          <Pencil />
                          Edit
                        </Button>
                        {!u.isSuperAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-sm">
                                <MoreVertical />
                                <span className="sr-only">User actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-52">
                              {u.isSuspended ? (
                                <DropdownMenuItem
                                  className="gap-2 px-2 py-1.5 whitespace-nowrap"
                                  onClick={() => setStatusChangeTarget({ user: u, action: 'reactivate' })}
                                >
                                  <RotateCcw />
                                  Reactivate account
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="gap-2 px-2 py-1.5 whitespace-nowrap"
                                  onClick={() => setStatusChangeTarget({ user: u, action: 'suspend' })}
                                >
                                  <Ban />
                                  Suspend account
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2 px-2 py-1.5 whitespace-nowrap"
                                variant="destructive"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 />
                                Delete account
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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
                Showing {rangeStart} to {rangeEnd} of {filtered.length} users
              </p>
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <EditUserDialog user={editTarget} onOpenChange={(open) => !open && setEditTarget(null)} />

      <ConfirmDialog
        open={!!statusChangeTarget}
        onOpenChange={(open) => !open && setStatusChangeTarget(null)}
        title={
          statusChangeTarget?.action === 'suspend' ? 'Suspend this account?' : 'Reactivate this account?'
        }
        description={
          statusChangeTarget?.action === 'suspend' ? (
            <>
              <strong>{statusChangeTarget.user.name}</strong> will be blocked from logging in
              anywhere on the platform until reactivated. No data is deleted — this is fully
              reversible.
            </>
          ) : (
            <>
              <strong>{statusChangeTarget?.user.name}</strong> will immediately be able to log
              back in.
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
        title="Delete this account permanently?"
        description={
          deleteTarget && (
            <>
              This permanently deletes <strong>{deleteTarget.name}</strong>'s account and all of
              their memberships, attempts, and grades in every workspace they belong to. This
              cannot be undone. If you want to temporarily block access instead, use{' '}
              <strong>Suspend account</strong>.
            </>
          )
        }
        confirmationValue={deleteTarget?.email ?? ''}
        confirmationLabel={`Type "${deleteTarget?.email ?? ''}" to confirm`}
        confirmLabel="Delete account"
        loading={deleteMutation.isPending}
        onConfirm={() =>
          deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, email: deleteTarget.email })
        }
      />
    </div>
  )
}
