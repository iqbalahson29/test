export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function keyToDate(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month, day)
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** A 6-week (42-day) grid starting on the Sunday on/before the 1st of viewMonth. */
export function buildMonthGrid(viewMonth: Date): Date[] {
  const gridStart = new Date(viewMonth)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function dayLabel(due: Date, today: Date) {
  const diffDays = Math.round((startOfDay(due).getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
