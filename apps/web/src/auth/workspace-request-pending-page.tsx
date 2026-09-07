import { Clock } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'

export function WorkspaceRequestPendingPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const email =
    (location.state as { email?: string } | null)?.email ?? searchParams.get('email')

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Clock className="size-5" />
          </div>
          <h1 className="text-base font-semibold">Your request is being reviewed</h1>
          <p className="text-sm text-muted-foreground">
            {email ? (
              <>
                We&apos;ve recorded your workspace request for{' '}
                <span className="font-medium text-foreground">{email}</span>. A platform admin
                still needs to approve it.
              </>
            ) : (
              <>
                We&apos;ve recorded your workspace request. A platform admin still needs to
                approve it.
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            There&apos;s nothing more to do on your end — once it&apos;s approved, the password
            you set will work right away.
          </p>
          <Link to="/login" className="text-sm font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
