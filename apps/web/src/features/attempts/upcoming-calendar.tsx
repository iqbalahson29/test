import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { MyAssignment } from '../assignments/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const AGENDA_LIMIT = 6

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function keyToDate(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month, day)
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function dayLabel(due: Date, today: Date) {
  const diffDays = Math.round((startOfDay(due).getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface DueItem {
  assignmentId: string
  quizTitle: string
  dueAt: Date
  status: MyAssignment['status']
}

export function UpcomingCalendar({
  assignments,
  onJump,
  title = 'Calendar',
}: {
  assignments: MyAssignment[]
  onJump: (assignmentId: string) => void
  title?: string
}) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const dueItems = useMemo<DueItem[]>(
    () =>
      assignments
        .filter(
          (a): a is MyAssignment & { dueAt: string } =>
            a.dueAt != null && a.status !== 'SUBMITTED' && a.status !== 'GRADED',
        )
        .map((a) => ({
          assignmentId: a.assignmentId,
          quizTitle: a.quizTitle,
          dueAt: new Date(a.dueAt),
          status: a.status,
        })),
    [assignments],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, DueItem[]>()
    for (const item of dueItems) {
      const key = dateKey(item.dueAt)
      const bucket = map.get(key)
      if (bucket) bucket.push(item)
      else map.set(key, [item])
    }
    return map
  }, [dueItems])

  const gridStart = useMemo(() => {
    const firstOfMonth = viewMonth
    const start = new Date(firstOfMonth)
    start.setDate(start.getDate() - start.getDay())
    return start
  }, [viewMonth])

  const gridDays = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [gridStart])

  const selectedItems = selectedKey ? (byDay.get(selectedKey) ?? []) : null

  const agendaItems = useMemo(() => {
    return dueItems
      .filter((i) => startOfDay(i.dueAt).getTime() >= today.getTime())
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, AGENDA_LIMIT)
  }, [dueItems, today])

  const listItems = selectedItems ?? agendaItems
  const listTitle = selectedKey
    ? keyToDate(selectedKey).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
    : 'Upcoming'

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() =>
              setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
            }
          >
            <ChevronLeft />
          </Button>
          <span className="w-24 text-center text-sm font-medium">
            {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() =>
              setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
            }
          >
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={i} className="py-1">
              {w}
            </div>
          ))}
          {gridDays.map((d) => {
            const key = dateKey(d)
            const inMonth = d.getMonth() === viewMonth.getMonth()
            const isToday = key === dateKey(today)
            const isSelected = key === selectedKey
            const hasDue = byDay.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey((k) => (k === key ? null : key))}
                className={cn(
                  'relative flex h-8 flex-col items-center justify-center rounded-md text-sm transition-colors hover:bg-muted',
                  !inMonth && 'text-muted-foreground/40',
                  isToday && 'font-semibold text-primary',
                  isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                {d.getDate()}
                {hasDue && (
                  <span
                    className={cn(
                      'absolute bottom-0.5 size-1 rounded-full bg-primary',
                      isSelected && 'bg-primary-foreground',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase">{listTitle}</p>
            {selectedKey && (
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear selected date"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {listItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {selectedKey ? 'Nothing due this day.' : 'Nothing due soon.'}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {listItems.map((item) => (
                <li key={item.assignmentId}>
                  <button
                    type="button"
                    onClick={() => onJump(item.assignmentId)}
                    className="flex w-full items-start justify-between gap-2 text-left text-sm hover:text-primary"
                  >
                    <span className="truncate">{item.quizTitle}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {dayLabel(item.dueAt, today)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
