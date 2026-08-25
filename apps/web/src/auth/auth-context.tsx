import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiPost } from '../lib/api-client'
import { setAccessToken } from './token-store'
import type { LoginApiResponse, Membership, RefreshApiResponse } from './types'

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'superadmin'

interface AuthContextValue {
  status: AuthStatus
  membership: Membership | null
  login: (email: string, password: string) => Promise<AuthStatus>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [membership, setMembership] = useState<Membership | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiPost<RefreshApiResponse>('/auth/refresh')
        setAccessToken(res.accessToken)
        if (cancelled) return
        if (res.status === 'ok') {
          setMembership(res.membership)
          setStatus('authenticated')
        } else {
          setMembership(null)
          setStatus('superadmin')
        }
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
    setAccessToken(res.accessToken)
    if (res.status === 'ok') {
      setMembership(res.membership)
      setStatus('authenticated')
      return 'authenticated'
    }
    setMembership(null)
    setStatus('superadmin')
    return 'superadmin'
  }

  const logout = async () => {
    try {
      await apiPost('/auth/logout')
    } catch {
      // ignore — we're clearing local state regardless
    }
    setAccessToken(null)
    setMembership(null)
    setStatus('unauthenticated')
  }

  return (
    <AuthContext.Provider value={{ status, membership, login, logout }}>
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
