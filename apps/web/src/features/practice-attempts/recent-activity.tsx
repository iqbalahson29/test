import { useMemo } from 'react'
import type { MyAttemptAnalytics } from '../practice-analytics/types'
import { AttemptStatusBadge } from './status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const ACTIVITY_LIMIT = 5

export function RecentActivity({ attempts }: { attempts: MyAttemptAnalytics[] }) {
  const recent = useMemo(
    () =>
      attempts
        .filter((a): a is MyAttemptAnalytics & { submittedAt: string } => a.submittedAt != null)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(0, ACTIVITY_LIMIT),
    [attempts],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((a) => (
              <li key={a.attemptId} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.quizTitle}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <AttemptStatusBadge status={a.status as 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'} />
                    {a.percent !== null && (
                      <span className="text-xs text-muted-foreground">{a.percent}%</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(a.submittedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
