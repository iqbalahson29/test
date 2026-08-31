import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, Check, X } from 'lucide-react'
import { ApiError, apiGet, apiPost } from '../lib/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pagination } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 10

type TenantRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

interface TenantRequestRow {
  id: string
  workspaceName: string
  slug: string
  description: string | null
  requesterName: string
  requesterEmail: string
  status: TenantRequestStatus
  createdAt: string
  reviewedAt: string | null
}

interface ConfirmTarget {
  id: string
  workspaceName: string
  action: 'approve' | 'reject'
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
  const queryClient = useQueryClient()
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-requests'],
    queryFn: () => apiGet<TenantRequestRow[]>('/tenant-requests'),
  })

  const requests = data ?? []
  const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRequests = requests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const rangeStart = requests.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, requests.length)

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/tenant-requests/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-requests'] })
      setConfirmTarget(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/tenant-requests/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-requests'] })
      setConfirmTarget(null)
    },
  })

  const error = approveMutation.error ?? rejectMutation.error
  const confirming = approveMutation.isPending || rejectMutation.isPending

  const onConfirm = () => {
    if (!confirmTarget) return
    if (confirmTarget.action === 'approve') {
      approveMutation.mutate(confirmTarget.id)
    } else {
      rejectMutation.mutate(confirmTarget.id)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="text-[17px] font-bold text-gray-900">Workspace requests</h1>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to="/superadmin/workspaces">
            <Building2 />
            Manage workspaces
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {error instanceof ApiError ? error.message : 'Something went wrong'}
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
                <TableHead>Requester</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRequests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="font-medium">{req.workspaceName}</div>
                    <div className="text-xs text-muted-foreground">{req.slug}</div>
                    {req.description && (
                      <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                        {req.description}
                      </div>
                    )}
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
                          onClick={() =>
                            setConfirmTarget({
                              id: req.id,
                              workspaceName: req.workspaceName,
                              action: 'approve',
                            })
                          }
                        >
                          <Check className="text-emerald-600" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setConfirmTarget({
                              id: req.id,
                              workspaceName: req.workspaceName,
                              action: 'reject',
                            })
                          }
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
          {requests.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-[12.5px] text-muted-foreground">
                Showing {rangeStart} to {rangeEnd} of {requests.length} requests
              </p>
              <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTarget?.action === 'approve' ? 'Approve workspace request?' : 'Reject workspace request?'}
        description={
          confirmTarget?.action === 'approve' ? (
            <>
              This creates the <strong>{confirmTarget.workspaceName}</strong> workspace and
              signs the requester in as its admin.
            </>
          ) : (
            <>
              This permanently rejects the request for{' '}
              <strong>{confirmTarget?.workspaceName}</strong>. The requester will need to submit
              a new request to try again.
            </>
          )
        }
        confirmLabel={confirmTarget?.action === 'approve' ? 'Approve' : 'Reject'}
        destructive={confirmTarget?.action === 'reject'}
        loading={confirming}
        onConfirm={onConfirm}
      />
    </div>
  )
}
