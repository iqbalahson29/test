import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { ALL_ROLES, Role } from '@quiz-platform/shared'
import { ApiError } from '../../lib/api-client'
import { memberInvitationsApi } from '../member-invitations/api'
import type { BulkInvitationResult } from '../member-invitations/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

// Accepts one entry per line: "email" or "email,role" (role defaults to the
// picker below when omitted).
function parseEntries(raw: string, defaultRole: Role) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [emailPart, rolePart] = line.split(',').map((s) => s.trim())
      const role = rolePart && ALL_ROLES.includes(rolePart.toUpperCase() as Role)
        ? (rolePart.toUpperCase() as Role)
        : defaultRole
      return { email: emailPart, role }
    })
}

export function ImportMembersDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [defaultRole, setDefaultRole] = useState<Role>(Role.STUDENT)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BulkInvitationResult | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const reset = () => {
    setRaw('')
    setDefaultRole(Role.STUDENT)
    setError(null)
    setResult(null)
    setCopiedToken(null)
  }

  const importMutation = useMutation({
    mutationFn: () => memberInvitationsApi.bulkCreate(parseEntries(raw, defaultRole)),
    onSuccess: (res) => {
      setError(null)
      setResult(res)
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] })
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Could not import members'),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const entries = parseEntries(raw, defaultRole)
    if (entries.length === 0) {
      setError('Paste at least one email address')
      return
    }
    importMutation.mutate()
  }

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/accept-invite/${token}`)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
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
        <Button type="button" variant="outline">
          Import members
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import members</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold text-emerald-600">{result.added.length}</p>
                <p className="text-xs text-muted-foreground">Added</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold text-amber-600">{result.invited.length}</p>
                <p className="text-xs text-muted-foreground">Invited</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-lg font-semibold text-destructive">{result.failed.length}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>

            {result.invited.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground">
                  Share these invite links:
                </p>
                {result.invited.map((r) =>
                  r.status === 'invited' ? (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate">{r.email}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => copyLink(r.token)}
                      >
                        {copiedToken === r.token ? (
                          <Check className="text-emerald-600" />
                        ) : (
                          <Copy />
                        )}
                      </Button>
                    </div>
                  ) : null,
                )}
              </div>
            )}

            {result.failed.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Couldn&apos;t add:</p>
                {result.failed.map((f) => (
                  <p key={f.email} className="text-xs text-destructive">
                    {f.email} — {f.reason}
                  </p>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>
                Import more
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
              <Label htmlFor="import-emails">Emails</Label>
              <Textarea
                id="import-emails"
                rows={6}
                placeholder={'jane@school.test\njohn@school.test,ADMIN'}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                One per line. Add <code>,ADMIN</code> or <code>,STUDENT</code> after an email to
                override the default role below.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-default-role">Default role</Label>
              <Select value={defaultRole} onValueChange={(v) => setDefaultRole(v as Role)}>
                <SelectTrigger id="import-default-role" className="w-full">
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
              <Button type="submit" disabled={importMutation.isPending}>
                {importMutation.isPending ? 'Importing…' : 'Import'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
