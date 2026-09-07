export interface ConfigEditorProps {
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}
