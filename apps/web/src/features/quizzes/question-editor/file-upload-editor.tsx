import type { ConfigEditorProps } from './config-editor-props'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface FileUploadConfig {
  allowedExtensions?: string[]
  maxSizeMb: number
}

export function FileUploadEditor({ config, onChange }: ConfigEditorProps) {
  const value = config as unknown as FileUploadConfig
  const extensionsText = (value.allowedExtensions ?? []).join(', ')

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="file-upload-extensions">
          Allowed extensions <span className="text-muted-foreground">(comma-separated, optional)</span>
        </Label>
        <Input
          id="file-upload-extensions"
          type="text"
          value={extensionsText}
          onChange={(e) =>
            onChange({
              ...value,
              allowedExtensions: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="pdf, jpg, png"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="file-upload-max-size">Max size (MB)</Label>
        <Input
          id="file-upload-max-size"
          type="number"
          min="1"
          max="100"
          value={value.maxSizeMb ?? 10}
          onChange={(e) => onChange({ ...value, maxSizeMb: Number(e.target.value) })}
        />
      </div>
      <p className="col-span-2 text-sm text-muted-foreground">
        File uploads are always graded manually by a teacher.
      </p>
    </div>
  )
}
