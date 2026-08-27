import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { LoadingScreen } from './loading-screen'

// For routes like /profile that work for any logged-in identity — admin,
// student, superadmin, or a 0-membership account — regardless of role or
// workspace membership.
export function AnyAuthRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return <LoadingScreen />
  }
  if (status === 'unauthenticated' || status === 'choosing-workspace') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
