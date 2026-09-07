import { X } from 'lucide-react'
import type { ConfigEditorProps } from './config-editor-props'
import { MathInput } from '@/components/math/math-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface Pair {
  left: string
  right: string
}
interface MatchingConfig {
  pairs: Pair[]
}

export function MatchingEditor({ config, onChange }: ConfigEditorProps) {
  const value = config as unknown as MatchingConfig
  const pairs = value.pairs ?? [
    { left: '', right: '' },
    { left: '', right: '' },
  ]

  const setPair = (i: number, side: 'left' | 'right', v: string) => {
    const next = [...pairs]
    next[i] = { ...next[i], [side]: v }
    onChange({ pairs: next })
  }
  const addPair = () => onChange({ pairs: [...pairs, { left: '', right: '' }] })
  const removePair = (i: number) => onChange({ pairs: pairs.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-2">
      <Label>Pairs</Label>
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <MathInput
            required
            value={p.left}
            onChange={(v) => setPair(i, 'left', v)}
            placeholder="Left"
          />
          <span className="text-muted-foreground">&harr;</span>
          <MathInput
            required
            value={p.right}
            onChange={(v) => setPair(i, 'right', v)}
            placeholder="Right"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removePair(i)}
            disabled={pairs.length <= 2}
            aria-label="Remove pair"
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" className="w-36" onClick={addPair}>
        Add pair
      </Button>
    </div>
  )
}
