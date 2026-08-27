import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

export function ChooseWorkspaceStep() {
  const { pendingChoices, selectWorkspace } = useAuth()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onContinue = async () => {
    if (!selected) return
    setSubmitting(true)
    try {
      await selectWorkspace(selected)
      navigate('/', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold">Choose a workspace</h2>
        <p className="text-sm text-muted-foreground">
          You belong to more than one workspace. Pick which one to sign in to.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={selected ?? undefined} onValueChange={setSelected}>
          {pendingChoices.map((m) => (
            <Label
              key={m.membershipId}
              htmlFor={m.membershipId}
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem id={m.membershipId} value={m.membershipId} />
              <div className="flex-1">
                <div className="text-sm font-medium">{m.tenantName}</div>
              </div>
              <Badge variant="secondary">{m.role}</Badge>
            </Label>
          ))}
        </RadioGroup>
        <Button className="w-full" disabled={!selected || submitting} onClick={onContinue}>
          {submitting ? 'Signing in…' : 'Continue'}
        </Button>
      </CardContent>
    </Card>
  )
}
