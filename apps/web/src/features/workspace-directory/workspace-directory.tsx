import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Clock, Plus, X } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { workspaceDirectoryApi } from './api'
import type { JoinRequestStatus } from './types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'

const PAGE_SIZE = 8

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

export function WorkspaceDirectory() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data: entries, isLoading } = useQuery({
    queryKey: ['workspace-directory'],
    queryFn: workspaceDirectoryApi.list,
  })
  const { data: myRequests } = useQuery({
    queryKey: ['my-join-requests'],
    queryFn: workspaceDirectoryApi.mine,
  })

  const totalPages = Math.max(1, Math.ceil((entries?.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageEntries = entries?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspace-directory'] })
    queryClient.invalidateQueries({ queryKey: ['my-join-requests'] })
  }

  const requestMutation = useMutation({
    mutationFn: (tenantId: string) => workspaceDirectoryApi.request(tenantId),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not send request'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => workspaceDirectoryApi.cancel(id),
    onSuccess: () => {
      invalidate()
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not cancel request'),
  })

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {myRequests && myRequests.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-[12.5px] font-bold text-gray-800">Your requests</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {myRequests.map((r) => (
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
                      variant="ghost"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(r.id)}
                    >
                      <X />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-[12.5px] font-bold text-gray-800">Available workspaces</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : entries?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workspaces exist yet.</p>
          ) : (
            pageEntries?.map((entry) => (
              <div
                key={entry.tenantId}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="size-4 text-muted-foreground" />
                  {entry.name}
                </span>
                {entry.membershipStatus === 'MEMBER' ? (
                  <Badge variant="secondary" className="gap-1">
                    <Check className="size-3" />
                    Member
                  </Badge>
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
                    size="sm"
                    disabled={requestMutation.isPending}
                    onClick={() => requestMutation.mutate(entry.tenantId)}
                  >
                    <Plus />
                    Request to join
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-center"
      />
    </div>
  )
}
