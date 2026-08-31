import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StatePage({
  icon: Icon,
  iconClassName,
  title,
  description,
  actions,
  children,
}: {
  icon: LucideIcon
  iconClassName?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <div
          className={cn(
            'flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground',
            iconClassName,
          )}
        >
          <Icon className="size-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
        {actions && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  )
}
