import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from './auth-context'
import { AppShell } from './app-shell'
import { WorkspaceDirectory } from '@/features/workspace-directory/workspace-directory'
import { Button } from '@/components/ui/button'

export function NoWorkspaceDashboard() {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)

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
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
    </AppShell>
  )
}
