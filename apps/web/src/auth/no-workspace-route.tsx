import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { LoadingScreen } from './loading-screen'
import { homePathForRole } from './types'

export function NoWorkspaceRoute({ children }: { children: ReactNode }) {
  const { status, membership } = useAuth()

  if (status === 'loading') {
    return <LoadingScreen />
  }
  if (status === 'authenticated' && membership) {
    return <Navigate to={homePathForRole(membership.role)} replace />
  }
  if (status === 'superadmin') {
    return <Navigate to="/superadmin" replace />
  }
  if (status !== 'no-workspace') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
