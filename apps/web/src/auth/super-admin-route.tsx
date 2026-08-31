import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ForbiddenPage } from '@/features/state-pages/forbidden-page'
import { useAuth } from './auth-context'
import { LoadingScreen } from './loading-screen'

export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { status, membership } = useAuth()

  if (status === 'loading') {
    return <LoadingScreen />
  }
  if (status === 'authenticated' && membership) {
    return <ForbiddenPage />
  }
  if (status !== 'superadmin') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
