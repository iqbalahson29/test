import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatePage } from './state-page'

export function OfflinePage() {
  return (
    <StatePage
      icon={WifiOff}
      iconClassName="bg-gray-200 text-gray-600"
      title="You're offline"
      description="Check your internet connection. Anything you were working on will still be here when you're back."
      actions={
        <Button type="button" onClick={() => window.location.reload()}>
          Try again
        </Button>
      }
    />
  )
}
