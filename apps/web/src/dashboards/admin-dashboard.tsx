import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList, Users } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        As the workspace admin you manage both quizzes and membership.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-4.5" />
            </div>
            <h2 className="mt-2 text-lg font-semibold">Quizzes</h2>
            <p className="text-sm text-muted-foreground">
              Create, publish, and review quizzes for your workspace.
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/teacher">
                Manage quizzes
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4.5" />
            </div>
            <h2 className="mt-2 text-lg font-semibold">Members</h2>
            <p className="text-sm text-muted-foreground">
              Invite teammates and manage roles across the workspace.
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin/members">
                Manage members
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
