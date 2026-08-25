import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { ApiError } from '../../lib/api-client'
import { assignmentsApi, membershipsApi } from './api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AssignmentPanel({ quizId }: { quizId: string }) {
  const queryClient = useQueryClient()
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['assignments', quizId],
    queryFn: () => assignmentsApi.listForQuiz(quizId),
  })
  const { data: members } = useQuery({
    queryKey: ['memberships'],
    queryFn: membershipsApi.list,
  })
  const students = members?.filter((m) => m.role === 'STUDENT') ?? []

  const [studentMembershipId, setStudentMembershipId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['assignments', quizId] })

  const assignMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.create({
        quizId,
        studentMembershipId,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      invalidate()
      setStudentMembershipId('')
      setDueAt('')
      setError(null)
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not assign quiz'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => assignmentsApi.remove(id),
    onSuccess: invalidate,
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!studentMembershipId) return
    assignMutation.mutate()
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="text-lg font-semibold">Assigned to</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="space-y-1.5">
            {assignments?.length === 0 && (
              <li className="text-sm text-muted-foreground">Not assigned to anyone yet.</li>
            )}
            {assignments?.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-medium">
                    {a.target.type === 'STUDENT' ? a.target.name : `Group: ${a.target.name}`}
                  </Badge>
                  {a.dueAt && (
                    <span className="text-muted-foreground">
                      due {new Date(a.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeMutation.mutate(a.id)}
                  aria-label="Remove assignment"
                >
                  <X className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="assign-student">Assign to student</Label>
            <Select value={studentMembershipId} onValueChange={setStudentMembershipId}>
              <SelectTrigger id="assign-student" className="w-full">
                <SelectValue placeholder="Select a student…" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user.name} ({s.user.email})
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
          <Button type="submit" disabled={!studentMembershipId || assignMutation.isPending}>
            <Plus />
            Assign
          </Button>
        </form>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
