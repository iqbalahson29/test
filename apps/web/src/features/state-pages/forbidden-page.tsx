import { ShieldAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { homePathForRole } from '@/auth/types'
import { Button } from '@/components/ui/button'
import { StatePage } from './state-page'

export function ForbiddenPage() {
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
      icon={ShieldAlert}
      iconClassName="bg-destructive/10 text-destructive"
      title="You don't have access to this"
      description="Your account doesn't have permission to view this page. If you think that's wrong, ask your workspace admin."
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
