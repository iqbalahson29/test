import { FileQuestion } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { homePathForRole } from '@/auth/types'
import { Button } from '@/components/ui/button'
import { StatePage } from './state-page'

export function NotFoundPage() {
  const { status, membership } = useAuth()
  const navigate = useNavigate()

  const homeHref =
    status === 'superadmin'
      ? '/superadmin'
      : status === 'no-workspace'
        ? '/no-workspace'
        : status === 'authenticated' && membership
          ? homePathForRole(membership.role)
          : '/login'

  return (
    <StatePage
      icon={FileQuestion}
      title="Page not found"
      description="The page you're looking for doesn't exist or may have been moved."
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button asChild>
            <Link to={homeHref}>Take me home</Link>
          </Button>
        </>
      }
    />
  )
}
