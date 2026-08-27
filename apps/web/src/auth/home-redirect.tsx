import { Navigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { LoadingScreen } from './loading-screen'
import { homePathForRole } from './types'

export function HomeRedirect() {
  const { status, membership } = useAuth()

  if (status === 'loading') {
    return <LoadingScreen />
  }
  if (status === 'superadmin') {
    return <Navigate to="/superadmin" replace />
  }
  if (status === 'no-workspace') {
    return <Navigate to="/no-workspace" replace />
  }
  if (status !== 'authenticated' || !membership) {
    return <Navigate to="/login" replace />
  }
  return <Navigate to={homePathForRole(membership.role)} replace />
}
