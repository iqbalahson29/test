import { X } from 'lucide-react'
import type { ConfigEditorProps } from './config-editor-props'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
          <Input
            type="text"
            required
            value={p.left}
            onChange={(e) => setPair(i, 'left', e.target.value)}
            placeholder="Left"
            className="flex-1"
          />
          <span className="text-muted-foreground">&harr;</span>
          <Input
            type="text"
            required
            value={p.right}
            onChange={(e) => setPair(i, 'right', e.target.value)}
            placeholder="Right"
            className="flex-1"
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
