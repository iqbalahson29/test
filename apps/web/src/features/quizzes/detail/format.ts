export function quizCode(id: string): string {
  return `QUIZ-${id.slice(-6).toUpperCase()}`
}

export function formatDuration(timeLimitSec: number | null): string {
  if (!timeLimitSec) return 'No limit'
  const minutes = Math.round(timeLimitSec / 60)
  return minutes < 1 ? `${timeLimitSec} sec` : `${minutes} min`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
