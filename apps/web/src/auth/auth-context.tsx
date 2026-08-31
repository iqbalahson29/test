import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost } from '../lib/api-client'
import { setAccessToken } from './token-store'
import type {
  EnterWorkspaceApiResponse,
  ExitWorkspaceApiResponse,
  LoginApiResponse,
  Membership,
  RefreshApiResponse,
  SelectWorkspaceApiResponse,
} from './types'

type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'superadmin'
  | 'choosing-workspace'
  | 'no-workspace'

interface AuthContextValue {
  status: AuthStatus
  membership: Membership | null
  pendingChoices: Membership[]
  login: (email: string, password: string) => Promise<AuthStatus>
  selectWorkspace: (membershipId: string) => Promise<void>
  switchWorkspace: (membershipId: string) => Promise<void>
  enterWorkspace: (tenantId: string) => Promise<void>
  exitToSuperAdmin: () => Promise<void>
  refreshSession: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [membership, setMembership] = useState<Membership | null>(null)
  const [pendingChoices, setPendingChoices] = useState<Membership[]>([])
  const [selectionToken, setSelectionToken] = useState<string | null>(null)

  const applyRefreshResult = (res: RefreshApiResponse) => {
    setAccessToken(res.accessToken)
    if (res.status === 'ok') {
      setMembership(res.membership)
      setStatus('authenticated')
    } else if (res.status === 'superadmin') {
      setMembership(null)
      setStatus('superadmin')
    } else {
      setMembership(null)
      setStatus('no-workspace')
    }
  }

  // Shared by the mount-time silent refresh and the no-workspace
  // dashboard's manual "Check again" button — re-deriving the session from
  // the httpOnly refresh cookie is exactly what lets a 0-membership account
  // pick up a newly-approved/assigned workspace without re-entering a
  // password.
  const refreshSession = async () => {
    try {
      const res = await apiPost<RefreshApiResponse>('/auth/refresh')
      applyRefreshResult(res)
      queryClient.clear()
    } catch {
      setStatus('unauthenticated')
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiPost<RefreshApiResponse>('/auth/refresh')
        if (cancelled) return
        applyRefreshResult(res)
      } catch {
        if (!cancelled) setStatus('unauthenticated')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (email: string, password: string): Promise<AuthStatus> => {
    const res = await apiPost<LoginApiResponse>('/auth/login', { email, password })

    if (res.status === 'choose-workspace') {
      setSelectionToken(res.selectionToken)
      setPendingChoices(res.choices)
      setStatus('choosing-workspace')
      return 'choosing-workspace'
    }

    setAccessToken(res.accessToken)
    queryClient.clear()
    if (res.status === 'ok') {
      setMembership(res.membership)
      setStatus('authenticated')
      return 'authenticated'
    }
    if (res.status === 'no-workspace') {
      setMembership(null)
      setStatus('no-workspace')
      return 'no-workspace'
    }
    setMembership(null)
    setStatus('superadmin')
    return 'superadmin'
  }

  const selectWorkspace = async (membershipId: string) => {
    if (!selectionToken) return
    const res = await apiPost<SelectWorkspaceApiResponse>('/auth/select-workspace', {
      selectionToken,
      membershipId,
    })
    setAccessToken(res.accessToken)
    setMembership(res.membership)
    setSelectionToken(null)
    setPendingChoices([])
    setStatus('authenticated')
    queryClient.clear()
  }

  const switchWorkspace = async (membershipId: string) => {
    const res = await apiPost<SelectWorkspaceApiResponse>('/auth/switch-workspace', {
      membershipId,
    })
    setAccessToken(res.accessToken)
    setMembership(res.membership)
    // Also reachable from 'no-workspace' (e.g. joining by code right after
    // having zero memberships) — without this, status stays 'no-workspace'
    // and ProtectedRoute bounces the very next navigation back to /login
    // even though the token/membership above are already valid.
    setStatus('authenticated')
    // Every cached query (assignments/mine, quizzes, analytics, ...) was
    // fetched under the old membership's tenant scope — without this,
    // components would keep showing the previous workspace's data until
    // something happens to trigger a refetch.
    queryClient.clear()
  }

  // Used by the super admin's "Enter workspace" flow — upserts a real ADMIN
  // membership server-side and swaps in a normal scoped session, so from
  // here on the super admin is indistinguishable from any other admin.
  const enterWorkspace = async (tenantId: string) => {
    const res = await apiPost<EnterWorkspaceApiResponse>('/auth/enter-workspace', {
      tenantId,
    })
    setAccessToken(res.accessToken)
    setMembership(res.membership)
    setStatus('authenticated')
    queryClient.clear()
  }

  // Reverses enterWorkspace() — drops the scoped membership session and
  // re-issues a superadmin session for the same account.
  const exitToSuperAdmin = async () => {
    const res = await apiPost<ExitWorkspaceApiResponse>('/auth/exit-workspace')
    setAccessToken(res.accessToken)
    setMembership(null)
    setStatus('superadmin')
    queryClient.clear()
  }

  const logout = async () => {
    try {
      await apiPost('/auth/logout')
    } catch {
      // ignore — we're clearing local state regardless
    }
    setAccessToken(null)
    setMembership(null)
    setPendingChoices([])
    setSelectionToken(null)
    setStatus('unauthenticated')
    queryClient.clear()
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        membership,
        pendingChoices,
        login,
        selectWorkspace,
        switchWorkspace,
        enterWorkspace,
        exitToSuperAdmin,
        refreshSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
