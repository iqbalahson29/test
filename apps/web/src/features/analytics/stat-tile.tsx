import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function StatTile({
  label,
  value,
  icon: Icon,
  footer,
}: {
  label: string
  value: string
  icon?: LucideIcon
  footer?: ReactNode
}) {
  return (
    <Card className="rounded-md">
      <CardContent className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {footer && <p className="mt-1 text-[12px] text-gray-400">{footer}</p>}
        </div>
        {Icon && (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
