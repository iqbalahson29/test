import { Plus, Trash2 } from 'lucide-react'
import type { ConfigEditorProps } from './config-editor-props'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Blank {
  acceptedAnswers: string[]
  caseSensitive: boolean
}
interface FillBlankConfig {
  blanks: Blank[]
}

// UI simplification: one primary accepted answer per blank (the shared Zod
// schema allows several, but a single answer covers the common case and
// keeps this editor manageable).
export function FillBlankEditor({ config, onChange }: ConfigEditorProps) {
  const value = config as unknown as FillBlankConfig
  const blanks = value.blanks ?? [{ acceptedAnswers: [''], caseSensitive: false }]

  const setAnswer = (i: number, v: string) => {
    const next = blanks.map((b, idx) =>
      idx === i ? { ...b, acceptedAnswers: [v] } : b,
    )
    onChange({ blanks: next })
  }
  const toggleCase = (i: number) => {
    const next = blanks.map((b, idx) =>
      idx === i ? { ...b, caseSensitive: !b.caseSensitive } : b,
    )
    onChange({ blanks: next })
  }
  const addBlank = () =>
    onChange({ blanks: [...blanks, { acceptedAnswers: [''], caseSensitive: false }] })
  const removeBlank = (i: number) =>
    onChange({ blanks: blanks.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Use <code className="rounded bg-muted px-1">{'{{1}}'}</code>,{' '}
        <code className="rounded bg-muted px-1">{'{{2}}'}</code>… in the prompt for each blank
        below, in order.
      </p>
      {blanks.map((b, i) => (
        <Card key={i}>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Blank {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeBlank(i)}
                disabled={blanks.length <= 1}
                aria-label="Remove blank"
              >
                <Trash2 />
              </Button>
            </div>
            <Input
              type="text"
              required
              value={b.acceptedAnswers[0] ?? ''}
              onChange={(e) => setAnswer(i, e.target.value)}
              placeholder="Accepted answer"
            />
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={b.caseSensitive} onCheckedChange={() => toggleCase(i)} />
              Case sensitive
            </Label>
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addBlank}>
        <Plus />
        Add blank
      </Button>
    </div>
  )
}
