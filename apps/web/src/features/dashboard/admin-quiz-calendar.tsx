import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { CalendarAssignment } from './types'
import { WEEKDAY_LABELS, buildMonthGrid, dateKey, keyToDate, startOfDay } from '@/lib/calendar-grid'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TargetFilter = 'ALL' | 'STUDENT' | 'GROUP'

export function AdminQuizCalendar({
  assignments,
  className,
}: {
  assignments: CalendarAssignment[]
  className?: string
}) {
  const navigate = useNavigate()
  const today = useMemo(() => startOfDay(new Date()), [])
  const [viewMonth, setViewMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('ALL')

  const dueByDay = useMemo(() => {
    const map = new Map<string, CalendarAssignment[]>()
    for (const a of assignments) {
      if (!a.dueAt) continue
      const key = dateKey(new Date(a.dueAt))
      const bucket = map.get(key)
      if (bucket) bucket.push(a)
      else map.set(key, [a])
    }
    return map
  }, [assignments])

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])

  const dayItems = selectedKey ? (dueByDay.get(selectedKey) ?? []) : []

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return dayItems
      .filter((a) => targetFilter === 'ALL' || a.target.type === targetFilter)
      .filter((a) => a.quizTitle.toLowerCase().includes(query))
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
  }, [dayItems, targetFilter, search])

  const closeDialog = (open: boolean) => {
    if (open) return
    setSelectedKey(null)
    setSearch('')
    setTargetFilter('ALL')
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Quiz calendar</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            >
              Today
            </Button>
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
          <p className="mb-2 text-center text-sm font-medium text-gray-700">
            {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
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
              const hasDue = dueByDay.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    'relative flex h-8 flex-col items-center justify-center rounded-md text-sm transition-colors hover:bg-muted',
                    !inMonth && 'text-muted-foreground/40',
                    isToday && 'bg-primary text-primary-foreground font-semibold hover:bg-primary',
                  )}
                >
                  {d.getDate()}
                  {hasDue && (
                    <span
                      className={cn(
                        'absolute bottom-0.5 size-1 rounded-full bg-primary',
                        isToday && 'bg-primary-foreground',
                      )}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedKey !== null} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedKey &&
                keyToDate(selectedKey).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
            </DialogTitle>
            <DialogDescription>
              {dayItems.length === 0
                ? 'No quizzes due on this day.'
                : `${dayItems.length} quiz${dayItems.length === 1 ? '' : 'zes'} due on this day.`}
            </DialogDescription>
          </DialogHeader>

          {dayItems.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search quiz title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={targetFilter}
                onValueChange={(v) => setTargetFilter(v as TargetFilter)}
              >
                <SelectTrigger size="sm" className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All targets</SelectItem>
                  <SelectItem value="STUDENT">Students</SelectItem>
                  <SelectItem value="GROUP">Groups</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {dayItems.length > 0 && filteredItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No quizzes match these filters.
              </p>
            )}
            {filteredItems.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  closeDialog(false)
                  navigate(`/teacher/quizzes/${a.quizId}`)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800">{a.quizTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.dueAt &&
                      new Date(a.dueAt).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 font-medium">
                  {a.target.type === 'GROUP' ? `Group: ${a.target.name}` : a.target.name}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
