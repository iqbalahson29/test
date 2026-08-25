import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { ALL_ROLES, Role } from '@quiz-platform/shared'
import { ApiError, apiDelete, apiGet, apiPost } from '../../lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

interface MembershipRow {
  id: string
  role: Role
  user: { id: string; email: string; name: string }
}

interface CreateMembershipForm {
  email: string
  name: string
  role: Role
  password: string
}

const emptyForm: CreateMembershipForm = {
  email: '',
  name: '',
  role: Role.STUDENT,
  password: '',
}

export function MembersPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['memberships'],
    queryFn: () => apiGet<MembershipRow[]>('/memberships'),
  })

  const [form, setForm] = useState<CreateMembershipForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (body: CreateMembershipForm) =>
      apiPost<MembershipRow>('/memberships', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
      setForm(emptyForm)
      setFormError(null)
    },
    onError: (err: unknown) =>
      setFormError(err instanceof ApiError ? err.message : 'Could not add member'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/memberships/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
      setRowError(null)
    },
    onError: (err: unknown) =>
      setRowError(err instanceof ApiError ? err.message : 'Could not remove member'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Manage members</h1>

      <Card className="mb-8 max-w-2xl">
        <CardHeader>
          <h2 className="text-lg font-semibold">Add a member</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-role">Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) => setForm({ ...form, role: value as Role })}
                >
                  <SelectTrigger id="member-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-name">
                  Name <span className="text-muted-foreground">(new users only)</span>
                </Label>
                <Input
                  id="member-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-password">
                  Password <span className="text-muted-foreground">(new users only)</span>
                </Label>
                <Input
                  id="member-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add member'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {rowError && (
        <Alert variant="destructive" className="mb-4 max-w-2xl">
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Card className="max-w-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.role}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(m.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="Remove member"
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
