import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, Sparkles, User } from 'lucide-react'
import { useAuth } from './auth-context'
import { WorkspaceDirectory } from '@/features/workspace-directory/workspace-directory'
import { Button } from '@/components/ui/button'

export function NoWorkspaceDashboard() {
  const { logout, refreshSession } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const onCheckAgain = async () => {
    setChecking(true)
    try {
      await refreshSession()
      navigate('/', { replace: true })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
          </div>
          <span className="font-semibold">Quiz Platform</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/profile">
              <User />
              Profile
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onLogout}>
            <LogOut />
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[17px] font-bold text-gray-900">
              You&apos;re not part of a workspace yet
            </h1>
            <p className="text-sm text-muted-foreground">
              Ask a teacher to add you by email, or request to join one below.
            </p>
          </div>
          <Button type="button" variant="outline" disabled={checking} onClick={onCheckAgain}>
            <RefreshCw className={checking ? 'animate-spin' : undefined} />
            Check again
          </Button>
        </div>
        <WorkspaceDirectory />
      </main>
    </div>
  )
}
