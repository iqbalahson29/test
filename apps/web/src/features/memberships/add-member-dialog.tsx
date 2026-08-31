import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { ALL_ROLES, Role } from '@quiz-platform/shared'
import { ApiError } from '../../lib/api-client'
import { memberInvitationsApi } from '../member-invitations/api'
import type { CreateInvitationResult } from '../member-invitations/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AddMemberDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(Role.STUDENT)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateInvitationResult | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setEmail('')
    setRole(Role.STUDENT)
    setError(null)
    setResult(null)
    setCopied(false)
  }

  const createMutation = useMutation({
    mutationFn: () => memberInvitationsApi.create(email, role),
    onSuccess: (res) => {
      setError(null)
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] })
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not add this member'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    createMutation.mutate()
  }

  const inviteLink =
    result?.status === 'invited' ? `${window.location.origin}/accept-invite/${result.token}` : null

  const copyLink = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">Add member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            {result.status === 'added' ? (
              <Alert>
                <Check className="size-4" />
                <AlertDescription>
                  {result.email} already had an account and was added as {result.role} right
                  away.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {result.email} doesn&apos;t have an account yet. Share this link with them —
                  they&apos;ll set up their account and be added as {result.role}.
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteLink ?? ''} onFocus={(e) => e.target.select()} />
                  <Button type="button" variant="outline" onClick={copyLink}>
                    {copied ? <Check className="text-emerald-600" /> : <Copy />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="add-member-email">Email</Label>
              <Input
                id="add-member-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-member-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="add-member-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Adding…' : 'Add member'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
