import { useId, useState } from 'react'
import { Check, Eye, EyeOff, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { passwordChecks, passwordStrengthLabel } from './password-rules'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  autoComplete: string
  placeholder?: string
  invalid?: boolean
}

export function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  autoComplete,
  placeholder,
  invalid,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        className="pr-9"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

const strengthColor = ['bg-destructive', 'bg-destructive', 'bg-amber-500', 'bg-amber-500', 'bg-emerald-500']

export function PasswordStrengthMeter({ password }: { password: string }) {
  const listId = useId()
  const passed = passwordChecks.filter((check) => check.test(password)).length

  if (!password) {
    return (
      <p className="text-xs text-muted-foreground">
        At least 10 characters, with an uppercase letter, a lowercase letter, and a number.
      </p>
    )
  }

  return (
    <div className="space-y-2" aria-describedby={listId}>
      <div className="flex items-center gap-2">
        <Progress
          value={(passed / passwordChecks.length) * 100}
          indicatorClassName={strengthColor[passed]}
        />
        <span className="w-12 shrink-0 text-right text-xs font-medium text-muted-foreground">
          {passwordStrengthLabel(passed)}
        </span>
      </div>
      <ul id={listId} className="grid grid-cols-2 gap-x-3 gap-y-1">
        {passwordChecks.map((check) => {
          const ok = check.test(password)
          return (
            <li
              key={check.label}
              className={cn(
                'flex items-center gap-1 text-xs',
                ok ? 'text-emerald-600' : 'text-muted-foreground',
              )}
            >
              {ok ? <Check className="size-3" /> : <X className="size-3" />}
              {check.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
