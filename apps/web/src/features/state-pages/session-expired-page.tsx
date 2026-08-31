import { Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { StatePage } from './state-page'

export function SessionExpiredPage() {
  const navigate = useNavigate()

  return (
    <StatePage
      icon={Clock}
      iconClassName="bg-gray-200 text-gray-600"
      title="Your session has expired"
      description="For your security, you've been signed out after a period of inactivity. Sign in again to continue."
      actions={
        <Button type="button" onClick={() => navigate('/login', { replace: true })}>
          Sign in again
        </Button>
      }
    />
  )
}
