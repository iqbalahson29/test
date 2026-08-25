import type { ConfigEditorProps } from './config-editor-props'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NumericConfig {
  correctAnswer: number
  tolerance: number
}

export function NumericEditor({ config, onChange }: ConfigEditorProps) {
  const value = config as unknown as NumericConfig
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="numeric-correct-answer">Correct answer</Label>
        <Input
          id="numeric-correct-answer"
          type="number"
          step="any"
          required
          value={value.correctAnswer ?? ''}
          onChange={(e) => onChange({ ...value, correctAnswer: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="numeric-tolerance">Tolerance (±)</Label>
        <Input
          id="numeric-tolerance"
          type="number"
          step="any"
          min="0"
          value={value.tolerance ?? 0}
          onChange={(e) => onChange({ ...value, tolerance: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}
