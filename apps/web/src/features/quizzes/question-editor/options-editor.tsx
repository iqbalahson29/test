import { Plus, X } from 'lucide-react'
import type { OptionInput } from '../types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export function OptionsEditor({
  mode,
  options,
  onChange,
}: {
  mode: 'single' | 'multi'
  options: OptionInput[]
  onChange: (options: OptionInput[]) => void
}) {
  const setText = (i: number, text: string) => {
    const next = [...options]
    next[i] = { ...next[i], text }
    onChange(next)
  }
  const setCorrect = (i: number) => {
    if (mode === 'single') {
      onChange(options.map((o, idx) => ({ ...o, isCorrect: idx === i })))
    } else {
      const next = [...options]
      next[i] = { ...next[i], isCorrect: !next[i].isCorrect }
      onChange(next)
    }
  }
  const addOption = () => onChange([...options, { text: '', isCorrect: false }])
  const removeOption = (i: number) => onChange(options.filter((_, idx) => idx !== i))

  const correctIndex = options.findIndex((o) => o.isCorrect)

  return (
    <div className="space-y-2">
      <Label>Options</Label>
      {mode === 'single' ? (
        <RadioGroup
          value={correctIndex >= 0 ? String(correctIndex) : undefined}
          onValueChange={(v) => setCorrect(Number(v))}
          className="gap-2"
        >
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <RadioGroupItem value={String(i)} aria-label={`Mark option ${i + 1} correct`} />
              <Input
                type="text"
                required
                value={o.text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder="Option text"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeOption(i)}
                disabled={options.length <= 2}
                aria-label="Remove option"
              >
                <X />
              </Button>
            </div>
          ))}
        </RadioGroup>
      ) : (
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                checked={o.isCorrect}
                onCheckedChange={() => setCorrect(i)}
                aria-label={`Mark option ${i + 1} correct`}
              />
              <Input
                type="text"
                required
                value={o.text}
                onChange={(e) => setText(i, e.target.value)}
                placeholder="Option text"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeOption(i)}
                disabled={options.length <= 2}
                aria-label="Remove option"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addOption}>
        <Plus />
        Add option
      </Button>
    </div>
  )
}
