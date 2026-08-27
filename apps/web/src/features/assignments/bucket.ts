import type { MyAssignment } from './types'

export type Bucket = 'overdue' | 'inProgress' | 'dueSoon' | 'upcoming' | 'completed'

export const BUCKET_ORDER: Bucket[] = ['overdue', 'inProgress', 'dueSoon', 'upcoming', 'completed']

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Overdue',
  inProgress: 'In progress',
  dueSoon: 'Due soon',
  upcoming: 'Upcoming',
  completed: 'Completed',
}

const DUE_SOON_DAYS = 7

export function bucketOf(a: MyAssignment, now: number): Bucket {
  if (a.status === 'SUBMITTED' || a.status === 'GRADED') return 'completed'
  const dueAt = a.dueAt ? new Date(a.dueAt).getTime() : null
  if (dueAt != null && dueAt < now) return 'overdue'
  if (a.status === 'IN_PROGRESS') return 'inProgress'
  if (dueAt != null && (dueAt - now) / 86_400_000 <= DUE_SOON_DAYS) return 'dueSoon'
  return 'upcoming'
}

export function groupByBucket(
  assignments: MyAssignment[],
  now: number,
): Record<Bucket, MyAssignment[]> {
  const groups: Record<Bucket, MyAssignment[]> = {
    overdue: [],
    inProgress: [],
    dueSoon: [],
    upcoming: [],
    completed: [],
  }
  for (const a of assignments) {
    groups[bucketOf(a, now)].push(a)
  }
  for (const bucket of BUCKET_ORDER) {
    groups[bucket].sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
      return aDue - bDue
    })
  }
  return groups
}
