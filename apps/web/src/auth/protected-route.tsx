import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '@quiz-platform/shared'
import { ForbiddenPage } from '@/features/state-pages/forbidden-page'
import { useAuth } from './auth-context'
import { LoadingScreen } from './loading-screen'

export function ProtectedRoute({
  role,
  children,
}: {
  role: Role
  children: ReactNode
}) {
  const { status, membership } = useAuth()

  if (status === 'loading') {
    return <LoadingScreen />
  }
  if (status === 'superadmin') {
    return <Navigate to="/superadmin" replace />
  }
  if (status !== 'authenticated' || !membership) {
    return <Navigate to="/login" replace />
  }
  if (membership.role !== role) {
    return <ForbiddenPage />
  }
  return <>{children}</>
}
