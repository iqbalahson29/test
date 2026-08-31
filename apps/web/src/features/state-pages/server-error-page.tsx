import { ServerCrash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatePage } from './state-page'

export function ServerErrorPage({ onRetry }: { onRetry?: () => void }) {
  return (
    <StatePage
      icon={ServerCrash}
      iconClassName="bg-destructive/10 text-destructive"
      title="Something went wrong"
      description="An unexpected error occurred on our end. Try again, and let us know if it keeps happening."
      actions={
        <Button type="button" onClick={onRetry ?? (() => window.location.reload())}>
          Try again
        </Button>
      }
    />
  )
}
