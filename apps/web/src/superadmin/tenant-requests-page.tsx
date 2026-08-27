import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Check, LogOut, Sparkles, User, X } from 'lucide-react'
import { ApiError, apiGet, apiPost } from '../lib/api-client'
import { useAuth } from '../auth/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TenantRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface TenantRequestRow {
  id: string
  workspaceName: string
  slug: string
  requesterName: string
  requesterEmail: string
  status: TenantRequestStatus
  createdAt: string
  reviewedAt: string | null
}

const statusStyles: Record<TenantRequestStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 [&>svg]:text-amber-500',
  APPROVED: 'bg-emerald-50 text-emerald-700 [&>svg]:text-emerald-500',
  REJECTED: 'bg-red-50 text-red-700 [&>svg]:text-red-500',
}

function StatusChip({ status }: { status: TenantRequestStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 border-transparent font-medium', statusStyles[status])}
    >
      <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0">
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
      {status}
    </Badge>
  )
}

export function TenantRequestsPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-requests'],
    queryFn: () => apiGet<TenantRequestRow[]>('/tenant-requests'),
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/tenant-requests/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-requests'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/tenant-requests/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-requests'] }),
  })

  const error = approveMutation.error ?? rejectMutation.error

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
          </div>
          <span className="font-semibold">Super Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/profile">
              <User />
              Profile
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onLogout}>
            <LogOut />
            Log out
          </Button>
        </div>
      </header>
      <main className="p-6">
        <h1 className="mb-6 text-[17px] font-bold text-gray-900">Workspace requests</h1>

        {error && (
          <Alert variant="destructive" className="mb-4 max-w-3xl">
            <AlertDescription>
              {error instanceof ApiError ? error.message : 'Something went wrong'}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="max-w-3xl overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="font-medium">{req.workspaceName}</div>
                      <div className="text-xs text-muted-foreground">{req.slug}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-foreground">{req.requesterName}</div>
                      <div className="text-xs text-muted-foreground">{req.requesterEmail}</div>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={req.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => approveMutation.mutate(req.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                          >
                            <Check className="text-emerald-600" />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => rejectMutation.mutate(req.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                          >
                            <X className="text-destructive" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  )
}
