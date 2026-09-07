import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Users } from 'lucide-react'
import { Role } from '@quiz-platform/shared'
import { apiGet, ApiError } from '../../lib/api-client'
import { practiceAssignmentsApi } from './api'
import { ExportMenu } from '@/components/export-menu'
import { exportSectionsToPdf, exportSheetsToExcel } from '@/lib/export'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StudentMembership {
  id: string
  role: Role
  user: { id: string; email: string; name: string }
}

const PAGE_SIZE = 6

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const ASSIGNMENTS_COLUMNS = ['Assigned to', 'Type', 'Email', 'Due date']

export function AssignmentPanel({ quizId, quizTitle }: { quizId: string; quizTitle: string }) {
  const queryClient = useQueryClient()
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['practice-assignments', quizId],
    queryFn: () => practiceAssignmentsApi.listForQuiz(quizId),
  })
  const [page, setPage] = useState(1)
  const { data: memberships } = useQuery({
    queryKey: ['memberships'],
    queryFn: () => apiGet<StudentMembership[]>('/memberships'),
  })
  const students = (memberships ?? []).filter((m) => m.role === Role.STUDENT)

  const totalPages = Math.max(1, Math.ceil((assignments?.length ?? 0) / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageAssignments = useMemo(
    () => (assignments ?? []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [assignments, currentPage],
  )

  const [studentMembershipId, setStudentMembershipId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; label: string } | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['practice-assignments', quizId] })
    queryClient.invalidateQueries({ queryKey: ['practice-assignment-summary', quizId] })
  }

  const assignMutation = useMutation({
    mutationFn: () =>
      practiceAssignmentsApi.create({
        quizId,
        studentMembershipId,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      invalidate()
      setStudentMembershipId('')
      setDueAt('')
      setError(null)
      setMessage(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not assign quiz'),
  })

  const assignAllMutation = useMutation({
    mutationFn: () =>
      practiceAssignmentsApi.assignAll({
        quizId,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: (result) => {
      invalidate()
      setError(null)
      setMessage(
        result.assigned === 0
          ? `Everyone (${result.totalStudents} student${result.totalStudents === 1 ? '' : 's'}) was already assigned.`
          : `Assigned to ${result.assigned} student${result.assigned === 1 ? '' : 's'}` +
              (result.alreadyAssigned > 0 ? ` (${result.alreadyAssigned} already assigned).` : '.'),
      )
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not assign to all students'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => practiceAssignmentsApi.remove(id),
    onSuccess: () => {
      invalidate()
      setConfirmTarget(null)
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!studentMembershipId) return
    assignMutation.mutate()
  }

  const onAssignAll = () => {
    if (!window.confirm('Assign this quiz to every student in the workspace?')) return
    assignAllMutation.mutate()
  }

  const assignmentExportRows = (assignments ?? []).map((a) => [
    a.target.type === 'GROUP' ? `Group: ${a.target.name}` : a.target.name,
    a.target.type,
    a.target.email ?? '—',
    a.dueAt ? new Date(a.dueAt).toLocaleDateString() : '—',
  ])

  const onExportPdf = () =>
    exportSectionsToPdf(`${quizTitle} - assignments`, `Assigned to — ${quizTitle}`, [
      { columns: ASSIGNMENTS_COLUMNS, rows: assignmentExportRows },
    ])

  const onExportExcel = () =>
    exportSheetsToExcel(`${quizTitle} - assignments`, [
      { name: 'Assigned to', columns: ASSIGNMENTS_COLUMNS, rows: assignmentExportRows },
    ])

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <h2 className="text-[12.5px] font-bold text-gray-800">Assigned to</h2>
        {assignments && assignments.length > 0 && (
          <ExportMenu onExportPdf={onExportPdf} onExportExcel={onExportExcel} />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="assign-student">Assign to student</Label>
            <Select
              value={studentMembershipId}
              onValueChange={setStudentMembershipId}
              disabled={students.length === 0}
            >
              <SelectTrigger id="assign-student" className="w-full">
                <SelectValue
                  placeholder={
                    students.length === 0 ? 'No students in this workspace yet' : 'Select a student…'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user.name} — {s.user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-due">Due date</Label>
            <Input
              id="assign-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="invisible">Assign</Label>
            <Button type="submit" disabled={!studentMembershipId || assignMutation.isPending}>
              Assign
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="invisible">Assign to all students</Label>
            <Button
              type="button"
              variant="outline"
              onClick={onAssignAll}
              disabled={assignAllMutation.isPending}
            >
              {assignAllMutation.isPending ? 'Assigning…' : 'Assign to all students'}
            </Button>
          </div>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {assignments?.length === 0 && (
                <li className="text-sm text-muted-foreground">Not assigned to anyone yet.</li>
              )}
              {pageAssignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {a.target.type === 'STUDENT' ? (
                      <Avatar size="sm" className="rounded-md">
                        <AvatarImage src={a.target.avatarUrl ?? undefined} alt="" className="rounded-md" />
                        <AvatarFallback className="rounded-md">
                          {initials(a.target.name)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Users className="size-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">
                        {a.target.type === 'GROUP' ? `Group: ${a.target.name}` : a.target.name}
                      </p>
                      {a.target.type === 'STUDENT' && a.target.email && (
                        <p className="truncate text-xs text-muted-foreground">{a.target.email}</p>
                      )}
                    </div>
                    {a.dueAt && (
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        due {new Date(a.dueAt).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfirmTarget({
                        id: a.id,
                        label:
                          a.target.type === 'STUDENT' ? a.target.name : `Group: ${a.target.name}`,
                      })
                    }
                    className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Unassign
                  </Button>
                </li>
              ))}
            </ul>
            {assignments && assignments.length > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-muted-foreground">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, assignments.length)} of {assignments.length}
                </p>
                <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-4" />
            </div>
            <DialogTitle>Unassign {confirmTarget?.label}?</DialogTitle>
            <DialogDescription>
              They&apos;ll no longer see this quiz assigned to them. Any attempt they&apos;ve
              already started or submitted is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => confirmTarget && removeMutation.mutate(confirmTarget.id)}
            >
              {removeMutation.isPending ? 'Unassigning…' : 'Unassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
