import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatePage } from './state-page'

export function MaintenancePage() {
  return (
    <StatePage
      icon={Wrench}
      iconClassName="bg-primary-100 text-primary-700"
      title="Down for maintenance"
      description="We're making some improvements and will be back shortly. Thanks for your patience."
      actions={
        <Button type="button" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      }
    />
  )
}
