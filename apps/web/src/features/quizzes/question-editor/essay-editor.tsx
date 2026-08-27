import type { ConfigEditorProps } from './config-editor-props'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface EssayConfig {
  minWords?: number
  maxWords?: number
}

export function EssayEditor({ config, onChange }: ConfigEditorProps) {
  const value = config as unknown as EssayConfig
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="essay-min-words">Min words (optional)</Label>
        <Input
          id="essay-min-words"
          type="number"
          min="0"
          value={value.minWords ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              minWords: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="essay-max-words">Max words (optional)</Label>
        <Input
          id="essay-max-words"
          type="number"
          min="1"
          value={value.maxWords ?? ''}
          onChange={(e) =>
            onChange({
              ...value,
              maxWords: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
      <p className="col-span-2 text-sm text-muted-foreground">
        Essay answers are always graded manually by a teacher.
      </p>
    </div>
  )
}
